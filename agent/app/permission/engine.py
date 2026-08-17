import fnmatch
from pathlib import Path

from app.permission.model import (
    PermissionDecision,
    PermissionEvaluation,
    PermissionMode,
    PermissionPolicy,
    PermissionRule,
)
from app.permission.shell_classifier import ShellCommandClassifier
from app.tool.base import Tool, ToolCategory, ToolContext, ToolInput

_SHELL_ALIASES = frozenset({"bash", "shell", "shell_command"})
_SOURCE_PRIORITY = {"session": 0, "user": 100, "project": 200, "local": 300}
_SIMPLE_PATCH_MAX_TOTAL_CHARS = 16_000
_SIMPLE_PATCH_MAX_LINES = 200


class PermissionEngine:
    """Evaluate one concrete tool call using the fixed permission layers."""

    def __init__(
        self,
        shell_classifier: ShellCommandClassifier | None = None,
    ) -> None:
        self._shell_classifier = shell_classifier or ShellCommandClassifier()

    def evaluate(
        self,
        tool: Tool,
        context: ToolContext,
        input_data: ToolInput,
        policy: PermissionPolicy,
    ) -> PermissionEvaluation:
        destructive = _is_effectively_destructive(tool, context, input_data)
        reversible = _is_effectively_reversible(tool, destructive)
        risk_level = _risk_level(tool, destructive)
        hard_denial = self._dangerous_shell_denial(tool, input_data)
        if hard_denial is not None:
            return hard_denial

        sandbox = self._path_sandbox(
            tool,
            context,
            input_data,
            destructive=destructive,
            reversible=reversible,
        )
        if sandbox is not None:
            return sandbox

        rule = self._matching_rule(tool, input_data, policy.rules)
        if rule is not None:
            return PermissionEvaluation(
                decision=rule.decision,
                layer="rule",
                reason=f"匹配 {rule.source} 级权限规则：{rule.tool}({rule.pattern})",
                risk_level=risk_level,
                reversible=reversible,
            )

        if policy.mode is PermissionMode.FULL_ACCESS:
            return PermissionEvaluation(
                PermissionDecision.ALLOW,
                "mode",
                "完全访问模式允许工作区内调用",
                risk_level=risk_level,
                reversible=reversible,
            )

        if tool.is_read_only(input_data):
            return PermissionEvaluation(
                PermissionDecision.ALLOW,
                "mode",
                "只读工具在当前权限模式下自动允许",
                risk_level=risk_level,
                reversible=reversible,
            )

        if policy.mode is PermissionMode.AUTO_APPROVE and tool.category is ToolCategory.SHELL:
            classification = self._shell_classifier.safe_fast_path(
                str(input_data.get("command") or ""), context.workspace_path
            )
            if classification is not None:
                return PermissionEvaluation(
                    PermissionDecision.ALLOW,
                    "shell_classifier",
                    f"确定性 Shell 分级器允许{classification.label}",
                    risk_level=classification.risk_level,
                    reversible=True,
                )
            return PermissionEvaluation(
                PermissionDecision.ASK,
                "mode",
                "Shell 命令未命中确定性安全规则，需要智能审批模型判断",
                risk_level=risk_level,
                reversible=reversible,
            )

        if (
            policy.mode is PermissionMode.AUTO_APPROVE
            and _is_simple_reversible_workspace_edit(
                tool,
                input_data,
                destructive=destructive,
                reversible=reversible,
            )
            and risk_level != "HIGH"
        ):
            return PermissionEvaluation(
                PermissionDecision.ALLOW,
                "mode",
                "替我审批模式允许工作区内可逆的局部修改",
                risk_level=risk_level,
                reversible=True,
            )

        if policy.mode is PermissionMode.AUTO_APPROVE and not destructive:
            return PermissionEvaluation(
                PermissionDecision.ALLOW,
                "mode",
                "替我审批模式允许非破坏性调用",
                risk_level=risk_level,
                reversible=reversible,
            )

        return PermissionEvaluation(
            PermissionDecision.ASK,
            "mode",
            "当前权限模式要求用户确认",
            risk_level=risk_level,
            reversible=reversible,
        )

    def _dangerous_shell_denial(
        self, tool: Tool, input_data: ToolInput
    ) -> PermissionEvaluation | None:
        if tool.category is not ToolCategory.SHELL:
            return None
        command = str(input_data.get("command") or "")
        if self._shell_classifier.is_catastrophic(command):
            return PermissionEvaluation(
                PermissionDecision.DENY,
                "blacklist",
                "命令命中不可绕过的危险 Shell 黑名单",
                risk_level="HIGH",
                reversible=False,
            )
        return None

    @staticmethod
    def _path_sandbox(
        tool: Tool,
        context: ToolContext,
        input_data: ToolInput,
        *,
        destructive: bool,
        reversible: bool,
    ) -> PermissionEvaluation | None:
        if tool.category is not ToolCategory.FILESYSTEM:
            return None
        raw_path = input_data.get("path")
        if raw_path is None:
            raw_path = input_data.get("pattern")
        if not isinstance(raw_path, str) or not raw_path.strip():
            return None
        path = Path(raw_path.strip()).expanduser()
        candidate = path.resolve() if path.is_absolute() else (context.workspace_path / path).resolve()
        try:
            candidate.relative_to(context.workspace_path)
            return None
        except ValueError:
            return PermissionEvaluation(
                PermissionDecision.ASK,
                "path_sandbox",
                f"文件路径超出工作区：{candidate}",
                risk_level="HIGH" if destructive else "MEDIUM",
                reversible=reversible,
                grants_external_path=True,
            )

    @staticmethod
    def _matching_rule(
        tool: Tool,
        input_data: ToolInput,
        rules: tuple[PermissionRule, ...],
    ) -> PermissionRule | None:
        actual_tool = "bash" if tool.category is ToolCategory.SHELL else tool.name
        value = (
            str(input_data.get("command") or "")
            if tool.category is ToolCategory.SHELL
            else str(input_data.get("path") or input_data.get("pattern") or "")
        )
        matching: list[PermissionRule] = []
        for rule in rules:
            normalized_tool = rule.tool.strip().casefold()
            tool_matches = (
                normalized_tool in _SHELL_ALIASES and actual_tool == "bash"
            ) or fnmatch.fnmatchcase(actual_tool.casefold(), normalized_tool)
            if tool_matches and fnmatch.fnmatchcase(value.casefold(), rule.pattern.casefold()):
                matching.append(rule)
        if not matching:
            return None

        effective_by_source: dict[str, PermissionRule] = {}
        for rule in matching:
            current = effective_by_source.get(rule.source)
            if current is None or rule.order >= current.order:
                effective_by_source[rule.source] = rule
        effective = list(effective_by_source.values())
        denied = [
            rule for rule in effective if rule.decision is PermissionDecision.DENY
        ]
        candidates = denied or effective
        return max(
            candidates,
            key=lambda rule: (_SOURCE_PRIORITY.get(rule.source, 0), rule.order),
        )


def _is_effectively_destructive(
    tool: Tool, context: ToolContext, input_data: ToolInput
) -> bool:
    if tool.category is not ToolCategory.FILESYSTEM or tool.name != "write_file":
        return tool.is_destructive(input_data)
    raw_path = input_data.get("path")
    if not isinstance(raw_path, str) or not raw_path.strip():
        return tool.is_destructive(input_data)
    path = Path(raw_path.strip()).expanduser()
    candidate = path.resolve() if path.is_absolute() else (context.workspace_path / path).resolve()
    try:
        candidate.relative_to(context.workspace_path)
    except ValueError:
        return tool.is_destructive(input_data)
    return candidate.exists()


def _is_effectively_reversible(tool: Tool, destructive: bool) -> bool:
    if not destructive:
        return True
    return tool.category is ToolCategory.FILESYSTEM and tool.name == "apply_patch"


def _risk_level(tool: Tool, destructive: bool) -> str:
    if destructive:
        return "HIGH" if tool.category is ToolCategory.SHELL else "MEDIUM"
    if tool.category is ToolCategory.SHELL:
        return "MEDIUM"
    return "LOW"


def _is_simple_reversible_workspace_edit(
    tool: Tool,
    input_data: ToolInput,
    *,
    destructive: bool,
    reversible: bool,
) -> bool:
    if (
        tool.category is not ToolCategory.FILESYSTEM
        or tool.name != "apply_patch"
        or not destructive
        or not reversible
    ):
        return False
    old_text = input_data.get("oldText")
    new_text = input_data.get("newText")
    if not isinstance(old_text, str) or not isinstance(new_text, str):
        return False
    return (
        len(old_text) + len(new_text) <= _SIMPLE_PATCH_MAX_TOTAL_CHARS
        and old_text.count("\n") + new_text.count("\n")
        <= _SIMPLE_PATCH_MAX_LINES
    )
