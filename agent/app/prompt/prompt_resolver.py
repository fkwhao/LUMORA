import logging
from dataclasses import dataclass

from app.prompt.prompt_metadata import authority_rank, binding_rank
from app.prompt.prompt_segment import PromptSegment

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class PromptConflict:
    key: str
    scope: str | None
    segments: tuple[PromptSegment, ...]


@dataclass(frozen=True, slots=True)
class PromptResolution:
    accepted: tuple[PromptSegment, ...]
    suppressed: tuple[PromptSegment, ...] = ()
    conflicts: tuple[PromptConflict, ...] = ()
    inapplicable: tuple[PromptSegment, ...] = ()


class PromptConflictError(ValueError):
    """同等约束强度的结构化指令无法确定性裁决时抛出的异常。"""

    def __init__(
        self,
        message: str | None = None,
        *,
        conflict_key: str | None = None,
        scope: str | None = None,
        segments: tuple[PromptSegment, ...] = (),
    ) -> None:
        self.conflict_key = conflict_key
        self.scope = scope
        self.sources = tuple(dict.fromkeys(
            segment.source.value for segment in segments
        ))
        self.source_refs = tuple(dict.fromkeys(
            segment.source_ref
            for segment in segments
            if segment.source_ref
        ))
        # 诊断信息只保留元数据；冲突片段正文不得跨越 HTTP 边界或写入日志。
        self.diagnostics = {
            "conflictKey": self.conflict_key,
            "scope": self.scope,
            "sources": self.sources,
            "sourceRefs": self.source_refs,
        }
        super().__init__(message or (
            "无法自动裁决同级 Prompt 指令冲突："
            f"key={self.conflict_key!r}, scope={self.scope!r}"
        ))


class PromptConflictResolver:
    """只裁决明确声明的结构化冲突。

    不带 ``conflict_key`` 的自然语言片段保持原有顺序，并依赖 Core Prompt 中的
    优先级说明。静默猜测任意两段文字是否冲突，不如明确暴露歧义安全。
    """

    def resolve(
        self,
        segments: tuple[PromptSegment, ...],
        *,
        active_scopes: tuple[str, ...] | None = None,
    ) -> PromptResolution:
        keyed: dict[str, list[tuple[int, PromptSegment]]] = {}
        inapplicable: list[PromptSegment] = []
        inapplicable_indices: set[int] = set()
        for index, segment in enumerate(segments):
            if active_scopes is not None and not scope_applies(
                segment.scope,
                active_scopes,
            ):
                inapplicable.append(segment)
                inapplicable_indices.add(index)
                continue
            if segment.conflict_key is None:
                continue
            keyed.setdefault(segment.conflict_key, []).append((index, segment))

        suppressed: list[PromptSegment] = []
        suppressed_indices: set[int] = set()
        conflicts: list[PromptConflict] = []
        for key, candidates in keyed.items():
            for component in _overlapping_components(candidates):
                unique: list[tuple[int, PromptSegment]] = []
                content_groups: list[list[tuple[int, PromptSegment]]] = []
                for candidate in component:
                    for group in content_groups:
                        if candidate[1].content == group[0][1].content:
                            group.append(candidate)
                            break
                    else:
                        content_groups.append([candidate])

                for group in content_groups:
                    representative = max(group, key=_candidate_rank)
                    unique.append(representative)
                    for candidate in group:
                        if candidate != representative:
                            suppressed.append(candidate[1])
                            suppressed_indices.add(candidate[0])

                if len(unique) <= 1:
                    continue

                ranked = sorted(
                    unique,
                    key=_candidate_rank,
                    reverse=True,
                )
                winner_index, winner = ranked[0]
                scopes = {segment.scope for _index, segment in unique}
                scope = next(iter(scopes)) if len(scopes) == 1 else None
                winner_score = (
                    binding_rank(winner.binding),
                    authority_rank(winner.authority),
                    scope_specificity(winner.scope),
                )
                tied = [
                    segment
                    for _index, segment in ranked
                    if (
                        binding_rank(segment.binding),
                        authority_rank(segment.authority),
                        scope_specificity(segment.scope),
                    ) == winner_score
                ]
                if len(tied) > 1:
                    error = PromptConflictError(
                        conflict_key=key,
                        scope=scope,
                        segments=tuple(segment for _index, segment in unique),
                    )
                    logger.warning(
                        "Prompt conflict key=%s scope=%s sources=%s "
                        "source_refs=%s",
                        error.conflict_key,
                        error.scope,
                        error.sources,
                        error.source_refs,
                    )
                    raise error

                conflicts.append(PromptConflict(
                    key=key,
                    scope=scope,
                    segments=tuple(segment for _index, segment in unique),
                ))
                suppressed.extend(
                    segment for index, segment in unique if index != winner_index
                )
                suppressed_indices.update(
                    index for index, _segment in unique if index != winner_index
                )

        excluded_indices = suppressed_indices | inapplicable_indices
        accepted = tuple(
            segment
            for index, segment in enumerate(segments)
            if index not in excluded_indices
        )
        return PromptResolution(
            accepted=accepted,
            suppressed=tuple(suppressed),
            conflicts=tuple(conflicts),
            inapplicable=tuple(inapplicable),
        )


def _candidate_rank(candidate: tuple[int, PromptSegment]) -> tuple[int, int, int, int]:
    index, segment = candidate
    return (
        binding_rank(segment.binding),
        authority_rank(segment.authority),
        scope_specificity(segment.scope),
        -index,
    )


def _overlapping_components(
    candidates: list[tuple[int, PromptSegment]],
) -> tuple[tuple[tuple[int, PromptSegment], ...], ...]:
    """将同一 conflictKey 拆分为彼此独立、可分别生效的作用域组件。"""
    remaining = list(candidates)
    components: list[tuple[tuple[int, PromptSegment], ...]] = []
    while remaining:
        component: list[tuple[int, PromptSegment]] = [remaining.pop(0)]
        changed = True
        while changed:
            changed = False
            for candidate in tuple(remaining):
                if any(
                    scopes_overlap(candidate[1].scope, member[1].scope)
                    for member in component
                ):
                    component.append(candidate)
                    remaining.remove(candidate)
                    changed = True
        components.append(tuple(component))
    return tuple(components)


def scopes_overlap(left: str | None, right: str | None) -> bool:
    """判断两个精确 Prompt 作用域是否可能约束同一个请求。"""
    left_value = _normalize_scope(left)
    right_value = _normalize_scope(right)
    if left_value in {"", "global", "*"} or right_value in {"", "global", "*"}:
        return True
    return left_value == right_value


def scope_applies(scope: str | None, active_scopes: tuple[str, ...]) -> bool:
    """判断片段是否适用于当前请求。

    作用域是精确标识符。``active_scopes`` 特意由可信 Builder 提供；工作区根作用域
    不会隐式激活 Builder 没有明确提供的更窄目录作用域。
    """
    candidate = _normalize_scope(scope)
    if candidate in {"", "global", "*"}:
        return True
    return candidate in {_normalize_scope(active) for active in active_scopes}


def scope_specificity(scope: str | None) -> int:
    """让具体作用域优先于全局或类别级作用域。"""
    value = _normalize_scope(scope)
    if value in {"", "global", "*"}:
        return 0
    return 1


def _normalize_scope(scope: str | None) -> str:
    return (scope or "").strip().replace("\\", "/").rstrip("/")
