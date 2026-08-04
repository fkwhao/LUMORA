import fnmatch
import re
from pathlib import Path

from app.permission.model import (
    PermissionDecision,
    PermissionEvaluation,
    PermissionMode,
    PermissionPolicy,
    PermissionRule,
)
from app.tool.base import Tool, ToolCategory, ToolContext, ToolInput

_SHELL_ALIASES = frozenset({"bash", "shell", "shell_command"})
_SOURCE_PRIORITY = {
    "session": 0,
    "user": 100,
    "project": 200,
    "local": 300,
}
_FORK_BOMB_PATTERN = re.compile(
    r":\(\)\s*\{\s*:\|:\s*&\s*\}\s*;\s*:",
    re.IGNORECASE,
)
_SHELL_TOKEN_PATTERN = re.compile(r'''"[^"]*"|'[^']*'|[^\s]+''')
_DANGEROUS_ROOT_EXPRESSIONS = frozenset(
    {
        "/",
        "/*",
        "~",
        "~/*",
        "$home",
        "$home/*",
        "${home}",
        "${home}/*",
        "$env:userprofile",
        "$env:userprofile\\*",
        "%userprofile%",
        "%userprofile%\\*",
    }
)
_CATASTROPHIC_COMMANDS = frozenset(
    {
        "shutdown",
        "shutdown.exe",
        "reboot",
        "format",
        "format.com",
        "restart-computer",
        "stop-computer",
    }
)
_FILE_DELETION_COMMANDS = frozenset(
    {"rm", "remove-item", "ri", "del", "erase", "rd", "rmdir"}
)


class PermissionEngine:
    """Evaluate one concrete tool call using the fixed permission layers."""

    def evaluate(
        self,
        tool: Tool,
        context: ToolContext,
        input_data: ToolInput,
        policy: PermissionPolicy,
    ) -> PermissionEvaluation:
        hard_denial = self._dangerous_shell_denial(tool, input_data)
        if hard_denial is not None:
            return hard_denial

        sandbox = self._path_sandbox(tool, context, input_data)
        if sandbox is not None:
            return sandbox

        rule = self._matching_rule(tool, input_data, policy.rules)
        if rule is not None:
            return PermissionEvaluation(
                decision=rule.decision,
                layer="rule",
                reason=(
                    f"匹配 {rule.source} 级权限规则："
                    f"{rule.tool}({rule.pattern})"
                ),
                risk_level=self._risk_level(tool, input_data),
                reversible=not tool.is_destructive(input_data),
            )

        if policy.mode is PermissionMode.FULL_ACCESS:
            return PermissionEvaluation(
                PermissionDecision.ALLOW,
                "mode",
                "完全访问模式允许工作区内调用",
            )

        if tool.is_read_only(input_data):
            return PermissionEvaluation(
                PermissionDecision.ALLOW,
                "mode",
                "只读工具在当前权限模式下自动允许",
            )

        if (
            policy.mode is PermissionMode.AUTO_APPROVE
            and not tool.is_destructive(input_data)
            and tool.category is not ToolCategory.SHELL
        ):
            return PermissionEvaluation(
                PermissionDecision.ALLOW,
                "mode",
                "替我审批模式允许非破坏性调用",
            )

        return PermissionEvaluation(
            PermissionDecision.ASK,
            "mode",
            "当前权限模式要求用户确认",
            risk_level=self._risk_level(tool, input_data),
            reversible=not tool.is_destructive(input_data),
        )

    @staticmethod
    def _dangerous_shell_denial(
        tool: Tool,
        input_data: ToolInput,
    ) -> PermissionEvaluation | None:
        if tool.category is not ToolCategory.SHELL:
            return None
        command = str(input_data.get("command") or "")
        if _is_catastrophic_shell_command(command):
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
    ) -> PermissionEvaluation | None:
        if tool.category is not ToolCategory.FILESYSTEM:
            return None
        raw_path = input_data.get("path")
        if raw_path is None:
            raw_path = input_data.get("pattern")
        if not isinstance(raw_path, str) or not raw_path.strip():
            return None
        path = Path(raw_path.strip()).expanduser()
        candidate = (
            path.resolve()
            if path.is_absolute()
            else (context.workspace_path / path).resolve()
        )
        try:
            candidate.relative_to(context.workspace_path)
            return None
        except ValueError:
            return PermissionEvaluation(
                PermissionDecision.ASK,
                "path_sandbox",
                f"文件路径超出工作区：{candidate}",
                risk_level=(
                    "HIGH" if tool.is_destructive(input_data) else "MEDIUM"
                ),
                reversible=not tool.is_destructive(input_data),
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
            if tool_matches and fnmatch.fnmatchcase(
                value.casefold(),
                rule.pattern.casefold(),
            ):
                matching.append(rule)
        if not matching:
            return None

        # Resolve each layer first so a later rule overrides an earlier rule
        # in that same file. Then merge effective denies across layers: an
        # allow from another layer can never reverse one of those denies.
        effective_by_source: dict[str, PermissionRule] = {}
        for rule in matching:
            current = effective_by_source.get(rule.source)
            if current is None or rule.order >= current.order:
                effective_by_source[rule.source] = rule
        effective = list(effective_by_source.values())
        denied = [
            rule
            for rule in effective
            if rule.decision is PermissionDecision.DENY
        ]
        candidates = denied or effective
        return max(
            candidates,
            key=lambda rule: (
                _SOURCE_PRIORITY.get(rule.source, 0),
                rule.order,
            ),
        )

    @staticmethod
    def _risk_level(tool: Tool, input_data: ToolInput) -> str:
        if tool.is_destructive(input_data):
            return "HIGH"
        if tool.category is ToolCategory.SHELL:
            return "MEDIUM"
        return "LOW"


def _is_catastrophic_shell_command(command: str) -> bool:
    if _FORK_BOMB_PATTERN.search(command):
        return True
    for raw_segment in re.split(r"[;&|\r\n]+", command):
        tokens = [
            token.strip('"\'').casefold()
            for token in _SHELL_TOKEN_PATTERN.findall(raw_segment)
        ]
        executable_index = _find_executable_index(tokens)
        if executable_index is None:
            continue
        executable = tokens[executable_index]
        arguments = tokens[executable_index + 1 :]
        if executable in _CATASTROPHIC_COMMANDS:
            return True
        if executable not in _FILE_DELETION_COMMANDS:
            continue

        flags = "".join(
            argument.lstrip("-/")
            for argument in arguments
            if argument.startswith(("-", "/"))
            and argument not in {"/", "/*"}
        )
        targets = [
            argument
            for argument in arguments
            if not argument.startswith(("-", "/")) or argument in {"/", "/*"}
        ]
        if not any(_is_dangerous_root(target) for target in targets):
            continue
        if executable == "rm" and "r" in flags and "f" in flags:
            return True
        if executable in {"remove-item", "ri"} and (
            "recurse" in flags and "force" in flags
        ):
            return True
        if executable in {"rd", "rmdir"} and "s" in flags and "q" in flags:
            return True
        if executable in {"del", "erase"} and "f" in flags:
            return True
    return False


def _find_executable_index(tokens: list[str]) -> int | None:
    if not tokens:
        return None
    index = 0
    while index < len(tokens) and tokens[index] in {"&", "command"}:
        index += 1
    if index < len(tokens) and tokens[index] == "sudo":
        index += 1
        while index < len(tokens) and tokens[index].startswith("-"):
            index += 1
    if index < len(tokens) and tokens[index] == "env":
        index += 1
        while index < len(tokens) and tokens[index].startswith("-"):
            index += 1
        while index < len(tokens) and re.fullmatch(
            r"[a-z_][a-z0-9_]*=.*",
            tokens[index],
            re.IGNORECASE,
        ):
            index += 1
    return index if index < len(tokens) else None


def _is_dangerous_root(value: str) -> bool:
    normalized = value.rstrip("\\/") or value
    if value in _DANGEROUS_ROOT_EXPRESSIONS:
        return True
    return bool(
        re.fullmatch(r"[a-z]:(?:[\\/]\*)?", normalized, re.IGNORECASE)
    )
