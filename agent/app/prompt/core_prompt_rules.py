from dataclasses import dataclass
from typing import ClassVar

from app.prompt.prompt_errors import PromptConfigurationError
from app.prompt.prompt_metadata import (
    PromptBinding,
    normalize_prompt_conflict_key,
)


@dataclass(frozen=True, slots=True)
class CorePromptRule:
    """登记一条允许项目覆盖的 Core 默认规则。"""

    conflict_key: str
    file_name: str
    binding: PromptBinding = PromptBinding.DEFAULT
    overrideable: bool = True
    template_marker: bool = True

    @property
    def source_ref(self) -> str:
        return f"{self.file_name}#{self.conflict_key}"


class CorePromptRuleRegistry:
    """Core 与项目规则进行确定性冲突裁决时使用的允许列表。

    模板 Marker 负责界定内容范围；本注册表负责确认 Marker 是否稳定，以及对应规则
    是否允许项目覆盖。模板中出现未注册的 Marker 时，视为配置错误。
    """

    _RULES: ClassVar[tuple[CorePromptRule, ...]] = (
        CorePromptRule(
            "lumora.collaboration.language",
            "10_collaboration.md",
        ),
        CorePromptRule(
            "lumora.collaboration.result_first",
            "10_collaboration.md",
        ),
        CorePromptRule(
            "lumora.collaboration.progress",
            "10_collaboration.md",
        ),
        CorePromptRule(
            "lumora.collaboration.no_hidden_reasoning",
            "10_collaboration.md",
        ),
        CorePromptRule(
            "lumora.collaboration.assumptions",
            "10_collaboration.md",
        ),
        CorePromptRule(
            "lumora.execution.read_only_diagnostics",
            "20_execution.md",
        ),
        CorePromptRule(
            "lumora.execution.requested_change",
            "20_execution.md",
        ),
        CorePromptRule(
            "lumora.execution.explore_before_change",
            "20_execution.md",
        ),
        CorePromptRule(
            "lumora.execution.plan_progress",
            "20_execution.md",
        ),
        CorePromptRule(
            "lumora.execution.simple_task",
            "20_execution.md",
        ),
        CorePromptRule(
            "lumora.execution.preserve_workspace",
            "20_execution.md",
        ),
        CorePromptRule(
            "lumora.execution.blocker",
            "20_execution.md",
        ),
        CorePromptRule(
            "lumora.execution.parallel_runtime",
            "20_execution.md",
        ),
        CorePromptRule(
            "lumora.response.markdown",
            "40_response.md",
        ),
        CorePromptRule(
            "lumora.response.terminology",
            "40_response.md",
        ),
        CorePromptRule(
            "lumora.response.status",
            "40_response.md",
        ),
        CorePromptRule(
            "lumora.response.summary",
            "40_response.md",
        ),
        CorePromptRule(
            "lumora.response.unregistered_tools",
            "40_response.md",
        ),
        CorePromptRule(
            "lumora.response.citations",
            "40_response.md",
        ),
        CorePromptRule(
            "lumora.response.citation_definitions",
            "40_response.md",
        ),
        CorePromptRule(
            "lumora.response.citation_sources",
            "40_response.md",
        ),
        CorePromptRule(
            "lumora.tool_safety.registered_tools",
            "30_tools_and_safety.md",
            PromptBinding.HARD,
            False,
            False,
        ),
        CorePromptRule(
            "lumora.tool_safety.untrusted_results",
            "30_tools_and_safety.md",
            PromptBinding.HARD,
            False,
            False,
        ),
        CorePromptRule(
            "lumora.tool_safety.authorized_files",
            "30_tools_and_safety.md",
            PromptBinding.HARD,
            False,
            False,
        ),
        CorePromptRule(
            "lumora.tool_safety.user_scope",
            "30_tools_and_safety.md",
            PromptBinding.HARD,
            False,
            False,
        ),
        CorePromptRule(
            "lumora.tool_safety.mcp_intent",
            "30_tools_and_safety.md",
            PromptBinding.HARD,
            False,
            False,
        ),
        CorePromptRule(
            "lumora.tool_safety.mcp_resources",
            "30_tools_and_safety.md",
            PromptBinding.HARD,
            False,
            False,
        ),
        CorePromptRule(
            "lumora.tool_safety.phase_progress",
            "30_tools_and_safety.md",
            PromptBinding.HARD,
            False,
            False,
        ),
        CorePromptRule(
            "lumora.tool_safety.status_density",
            "30_tools_and_safety.md",
            PromptBinding.HARD,
            False,
            False,
        ),
        CorePromptRule(
            "lumora.tool_safety.local_edits",
            "30_tools_and_safety.md",
            PromptBinding.HARD,
            False,
            False,
        ),
        CorePromptRule(
            "lumora.tool_safety.full_write",
            "30_tools_and_safety.md",
            PromptBinding.HARD,
            False,
            False,
        ),
        CorePromptRule(
            "lumora.tool_safety.destructive_actions",
            "30_tools_and_safety.md",
            PromptBinding.HARD,
            False,
            False,
        ),
        CorePromptRule(
            "lumora.tool_safety.secrets",
            "30_tools_and_safety.md",
            PromptBinding.HARD,
            False,
            False,
        ),
        CorePromptRule(
            "lumora.tool_safety.runtime_boundary",
            "30_tools_and_safety.md",
            PromptBinding.HARD,
            False,
            False,
        ),
    )

    def __init__(self, rules: tuple[CorePromptRule, ...] | None = None) -> None:
        configured = rules if rules is not None else self._RULES
        by_key: dict[str, CorePromptRule] = {}
        for rule in configured:
            try:
                normalized_key = normalize_prompt_conflict_key(
                    rule.conflict_key
                )
            except (TypeError, ValueError) as error:
                raise PromptConfigurationError(
                    f"Core Prompt conflictKey 无效：{rule.conflict_key}"
                ) from error
            if normalized_key is None or normalized_key in by_key:
                raise PromptConfigurationError(
                    f"Core Prompt conflictKey 重复：{rule.conflict_key}"
                )
            if rule.template_marker:
                if (
                    rule.binding is not PromptBinding.DEFAULT
                    or not rule.overrideable
                ):
                    raise PromptConfigurationError(
                        "Core Prompt 原子注册表只能登记可覆盖的 DEFAULT 规则："
                        f"{rule.conflict_key}"
                    )
            elif rule.binding is not PromptBinding.HARD or rule.overrideable:
                raise PromptConfigurationError(
                    "Core Prompt 非原子注册规则必须是不可覆盖的 HARD 规则："
                    f"{rule.conflict_key}"
                )
            if not normalized_key.startswith("lumora."):
                raise PromptConfigurationError(
                    f"Core Prompt conflictKey 必须使用 lumora 命名空间："
                    f"{rule.conflict_key}"
                )
            if normalized_key != rule.conflict_key:
                raise PromptConfigurationError(
                    f"Core Prompt conflictKey 未规范化：{rule.conflict_key}"
                )
            by_key[normalized_key] = rule
        self._by_key = by_key

    @property
    def keys(self) -> frozenset[str]:
        return frozenset(self._by_key)

    def get(self, conflict_key: str) -> CorePromptRule | None:
        return self._by_key.get(conflict_key)

    def validate_template_marker(
        self,
        file_name: str,
        conflict_key: str,
    ) -> CorePromptRule:
        rule = self.get(conflict_key)
        if rule is None:
            raise PromptConfigurationError(
                f"System Prompt marker 未注册：{conflict_key}"
            )
        if rule.file_name != file_name:
            raise PromptConfigurationError(
                "System Prompt marker 所属文件不匹配："
                f"{conflict_key} 应位于 {rule.file_name}"
            )
        if not rule.template_marker:
            raise PromptConfigurationError(
                f"Core HARD 规则不能使用原子 marker：{conflict_key}"
            )
        return rule

    def validate_template_completeness(
        self,
        seen_conflict_keys: set[str],
    ) -> None:
        missing = tuple(sorted(
            rule.conflict_key
            for rule in self._by_key.values()
            if rule.template_marker and rule.conflict_key not in seen_conflict_keys
        ))
        if missing:
            raise PromptConfigurationError(
                "System Prompt 缺少已注册的原子规则："
                f"{', '.join(missing)}"
            )

    def validate_project_conflict_key(self, conflict_key: str) -> str:
        try:
            normalized = normalize_prompt_conflict_key(conflict_key)
        except (TypeError, ValueError) as error:
            raise PromptConfigurationError(
                f"项目 Prompt conflictKey 无效：{conflict_key}"
            ) from error
        if normalized is None:
            raise PromptConfigurationError("项目 Prompt conflictKey 不能为空")
        if normalized.startswith("lumora."):
            rule = self.get(normalized)
            if rule is None:
                raise PromptConfigurationError(
                    "项目 Prompt 引用了不存在或不可覆盖的 Core 规则："
                    f"{normalized}"
                )
            if not rule.overrideable or rule.binding is not PromptBinding.DEFAULT:
                raise PromptConfigurationError(
                    f"项目 Prompt 不能覆盖 Core HARD 规则：{normalized}"
                )
            return normalized
        if normalized.startswith("project.") and normalized != "project.":
            return normalized
        raise PromptConfigurationError(
            "项目 Prompt conflictKey 必须使用 lumora.* 或 project.* 命名空间："
            f"{normalized}"
        )


DEFAULT_CORE_PROMPT_RULE_REGISTRY = CorePromptRuleRegistry()
