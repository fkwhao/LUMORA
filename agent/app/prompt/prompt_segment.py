from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any, Literal

from app.prompt.prompt_metadata import (
    PromptAuthority,
    PromptBinding,
    PromptKind,
    PromptPolicy,
    PromptRetention,
    PromptSource,
    PromptTrustLevel,
    normalize_prompt_conflict_key,
    validate_prompt_metadata,
)


class PromptTarget(StrEnum):
    SYSTEM = "system"
    MESSAGES = "messages"
    TOOLS = "tools"
    RESOLUTION = "resolution"


# 为兼容旧接口保留的名称。该字段只控制上下文保留，不参与语义指令权威判断。
PromptPriority = PromptRetention


class PromptCachePolicy(StrEnum):
    STATIC = "static"
    TASK = "task"
    REQUEST = "request"


@dataclass(frozen=True, slots=True)
class PromptSegment:
    key: str
    target: PromptTarget
    content: str | dict[str, Any]
    trust_level: PromptTrustLevel
    priority: PromptPriority
    cache_policy: PromptCachePolicy
    role: Literal["system", "user", "assistant"] = "system"
    source: PromptSource = PromptSource.RUNTIME
    authority: PromptAuthority | None = None
    binding: PromptBinding | None = None
    kind: PromptKind = PromptKind.INSTRUCTION
    scope: str | None = None
    source_ref: str | None = None
    conflict_key: str | None = None
    _source_capability: object | None = field(
        default=None,
        repr=False,
        compare=False,
    )

    @property
    def retention(self) -> PromptRetention:
        """旧版 ``priority`` 保留字段的推荐名称。"""
        return self.priority

    def __post_init__(self) -> None:
        if self.source == PromptSource.SECURITY_RUNTIME:
            if self._source_capability is not _SECURITY_RUNTIME_CAPABILITY:
                raise ValueError(
                    "SECURITY_RUNTIME 片段只能由安全运行时工厂创建"
                )
        elif self._source_capability is not None:
            raise ValueError("安全运行时 capability 只能用于 SECURITY_RUNTIME")
        authority, binding, trust_level = PromptPolicy.for_source(
            self.source
        ).derive(
            self.authority,
            self.binding,
            self.trust_level,
        )
        object.__setattr__(self, "authority", authority)
        object.__setattr__(self, "binding", binding)
        object.__setattr__(self, "trust_level", trust_level)
        validate_prompt_metadata(
            self.source,
            authority,
            binding,
            trust_level,
        )
        normalized_conflict_key = normalize_prompt_conflict_key(
            self.conflict_key
        )
        if normalized_conflict_key is not None:
            if self.kind != PromptKind.INSTRUCTION:
                raise ValueError(
                    "只有 INSTRUCTION 片段可以设置 conflictKey"
                )
            if self.target not in {
                PromptTarget.SYSTEM,
                PromptTarget.RESOLUTION,
            }:
                raise ValueError(
                    "conflictKey 只能用于 system 或 resolution 片段"
                )
            if not isinstance(self.source_ref, str) or not self.source_ref.strip():
                raise ValueError(
                    "设置 conflictKey 的片段必须提供 sourceRef"
                )
            object.__setattr__(self, "conflict_key", normalized_conflict_key)
        if self.source in {
            PromptSource.MEMORY,
            PromptSource.HISTORY,
        } and (
            self.target != PromptTarget.MESSAGES
            or self.role != "user"
            or self.trust_level != PromptTrustLevel.USER_CONTEXT
        ):
            raise ValueError("Memory 和历史摘要只能作为低信任 user message 传递")
        if self.source == PromptSource.USER_TASK and (
            self.target not in {
                PromptTarget.MESSAGES,
                PromptTarget.RESOLUTION,
            }
            or self.role != "user"
            or self.trust_level != PromptTrustLevel.USER_CONTEXT
        ):
            raise ValueError("用户任务只能作为低信任 user message 或裁决元数据")
        if self.source == PromptSource.TOOL_CONTRACT and (
            self.target != PromptTarget.TOOLS
        ):
            raise ValueError("工具契约只能进入 tools")
        if (
            self.source == PromptSource.RUNTIME
            and self.target == PromptTarget.MESSAGES
            and (
                self.role != "user"
                or self.trust_level != PromptTrustLevel.USER_CONTEXT
            )
        ):
            raise ValueError("运行时上下文只能作为低信任 user message 传递")
        if self.source in {
            PromptSource.STATIC_SYSTEM,
            PromptSource.SECURITY_RUNTIME,
            PromptSource.WORKSPACE_FILE,
            PromptSource.UPSTREAM_PROJECT,
        } and self.target != PromptTarget.SYSTEM:
            raise ValueError("可信 Prompt 规则只能进入 system")
        if (
            self.target == PromptTarget.SYSTEM
            and self.trust_level != PromptTrustLevel.TRUSTED
        ):
            raise ValueError("只有可信片段可以进入 system")
        if self.target == PromptTarget.TOOLS:
            if self.trust_level != PromptTrustLevel.TRUSTED:
                raise ValueError("只有可信工具定义可以进入 tools")
            if not isinstance(self.content, dict):
                raise ValueError("tools 片段必须是 JSON Schema 对象")
        elif not isinstance(self.content, str):
            raise ValueError("system/messages 片段必须是文本")


_SECURITY_RUNTIME_CAPABILITY = object()


def create_security_runtime_segment(
    *,
    key: str,
    target: PromptTarget,
    content: str | dict[str, Any],
    trust_level: PromptTrustLevel,
    priority: PromptPriority,
    cache_policy: PromptCachePolicy,
    role: Literal["system", "user", "assistant"] = "system",
    kind: PromptKind = PromptKind.INSTRUCTION,
    scope: str | None = None,
    source_ref: str | None = None,
    conflict_key: str | None = None,
) -> PromptSegment:
    """通过可信工厂路径创建安全运行时片段。"""
    return PromptSegment(
        key=key,
        target=target,
        content=content,
        trust_level=trust_level,
        priority=priority,
        cache_policy=cache_policy,
        role=role,
        source=PromptSource.SECURITY_RUNTIME,
        kind=kind,
        scope=scope,
        source_ref=source_ref,
        conflict_key=conflict_key,
        _source_capability=_SECURITY_RUNTIME_CAPABILITY,
    )
