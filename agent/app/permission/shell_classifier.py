import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

_FORK_BOMB_PATTERN = re.compile(
    r":\(\)\s*\{\s*:\|:\s*&\s*\}\s*;\s*:",
    re.IGNORECASE,
)
_SHELL_TOKEN_PATTERN = re.compile(r'''"[^"]*"|'[^']*'|[^\s]+''')
_SIMPLE_SHELL_META_PATTERN = re.compile(r"[;&|<>`\r\n]|\$\(|\$\{|%[^%]+%")
_DANGEROUS_ROOT_EXPRESSIONS = frozenset({
    "/", "/*", "~", "~/*", "$home", "$home/*", "${home}",
    "${home}/*", "$env:userprofile", "$env:userprofile\\*",
    "%userprofile%", "%userprofile%\\*",
})
_CATASTROPHIC_COMMANDS = frozenset({
    "shutdown", "shutdown.exe", "reboot", "format", "format.com",
    "restart-computer", "stop-computer",
})
_FILE_DELETION_COMMANDS = frozenset(
    {"rm", "remove-item", "ri", "del", "erase", "rd", "rmdir"}
)


@dataclass(frozen=True, slots=True)
class ShellPolicy:
    version_commands: frozenset[str]
    read_only_commands: frozenset[str]
    read_only_blocked_options: dict[str, frozenset[str]]
    git_read_only_subcommands: frozenset[str]
    git_blocked_options: frozenset[str]
    project_scripts: frozenset[str]
    maven_phases: frozenset[str]
    gradle_tasks: frozenset[str]
    cargo_tasks: frozenset[str]
    go_tasks: frozenset[str]
    dotnet_tasks: frozenset[str]
    validation_blocked_options: dict[str, frozenset[str]]


@dataclass(frozen=True, slots=True)
class ShellClassification:
    label: str
    risk_level: str
    activity_kind: str


class ShellCommandClassifier:
    """Deterministic, configurable classifier for simple shell commands."""

    def __init__(self, policy: ShellPolicy | None = None) -> None:
        self._policy = policy or load_default_shell_policy()

    def safe_fast_path(
        self,
        command: str,
        workspace_path: Path,
    ) -> ShellClassification | None:
        tokens = _simple_shell_tokens(command)
        if tokens is None or _references_external_path(tokens, workspace_path):
            return None
        executable = _normalized_executable(tokens[0])
        arguments = [token.casefold() for token in tokens[1:]]
        if not executable:
            return None
        if self._is_version_query(executable, arguments):
            return ShellClassification("版本查询命令", "LOW", "version")
        if self._is_read_only_call(executable, arguments):
            return ShellClassification("只读命令", "LOW", "read")
        if self._is_validation_call(executable, arguments):
            return ShellClassification(
                "项目测试、检查或构建命令", "MEDIUM", "validation"
            )
        return None

    @staticmethod
    def is_catastrophic(command: str) -> bool:
        return _is_catastrophic_shell_command(command)

    def _is_version_query(self, executable: str, arguments: list[str]) -> bool:
        return (
            executable in self._policy.version_commands
            and len(arguments) == 1
            and arguments[0] in {"--version", "-version", "version"}
        )

    def _is_read_only_call(self, executable: str, arguments: list[str]) -> bool:
        if executable in self._policy.read_only_commands:
            blocked = self._policy.read_only_blocked_options.get(
                executable, frozenset()
            )
            return not _contains_option(arguments, blocked)
        if executable != "git" or not arguments:
            return False
        if _contains_option(arguments, self._policy.git_blocked_options):
            return False
        subcommand = arguments[0]
        if subcommand in self._policy.git_read_only_subcommands:
            return True
        if subcommand == "branch":
            return len(arguments) == 2 and arguments[1] in {
                "--all", "--list", "--remotes", "--show-current", "-a", "-r",
            }
        if subcommand == "remote":
            return arguments[1:] == ["-v"] or (
                len(arguments) >= 2 and arguments[1] == "get-url"
            )
        return False

    def _is_validation_call(self, executable: str, arguments: list[str]) -> bool:
        blocked = self._policy.validation_blocked_options
        if executable == "pytest":
            return not _contains_option(arguments, blocked["pytest"])
        if executable in {"py", "python"}:
            return (
                len(arguments) >= 2
                and arguments[:2] == ["-m", "pytest"]
                and not _contains_option(arguments[2:], blocked["pytest"])
            )
        if executable in {"npm", "pnpm", "yarn"}:
            return _is_project_script_call(arguments, self._policy.project_scripts)
        if executable in {"mvn", "mvnw"}:
            return _all_non_options_allowed(arguments, self._policy.maven_phases)
        if executable in {"gradle", "gradlew"}:
            tasks = [
                argument.rsplit(":", 1)[-1]
                for argument in arguments
                if not argument.startswith("-")
            ]
            return bool(tasks) and all(
                task in self._policy.gradle_tasks for task in tasks
            )
        if executable == "cargo":
            return bool(arguments) and arguments[0] in self._policy.cargo_tasks
        if executable == "go":
            return (
                bool(arguments)
                and arguments[0] in self._policy.go_tasks
                and not _contains_option(arguments[1:], blocked["go"])
            )
        if executable == "dotnet":
            return bool(arguments) and arguments[0] in self._policy.dotnet_tasks
        if executable == "ruff":
            return (
                bool(arguments)
                and arguments[0] in {"check", "format"}
                and not _contains_option(arguments[1:], blocked["ruff"])
                and (arguments[0] != "format" or "--check" in arguments)
            )
        return executable == "mypy" and not _contains_option(
            arguments, blocked["mypy"]
        )


@lru_cache(maxsize=1)
def load_default_shell_policy() -> ShellPolicy:
    path = Path(__file__).with_name("default_shell_policy.yaml")
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise TypeError("Shell 分级策略格式无效")
    git = _mapping(raw, "git")
    validation = _mapping(raw, "validation")
    return ShellPolicy(
        version_commands=_strings(raw, "versionCommands"),
        read_only_commands=_strings(raw, "readOnlyCommands"),
        read_only_blocked_options=_string_map(raw, "readOnlyBlockedOptions"),
        git_read_only_subcommands=_strings(git, "readOnlySubcommands"),
        git_blocked_options=_strings(git, "blockedOptions"),
        project_scripts=_strings(validation, "projectScripts"),
        maven_phases=_strings(validation, "mavenPhases"),
        gradle_tasks=_strings(validation, "gradleTasks"),
        cargo_tasks=_strings(validation, "cargoTasks"),
        go_tasks=_strings(validation, "goTasks"),
        dotnet_tasks=_strings(validation, "dotnetTasks"),
        validation_blocked_options=_string_map(validation, "blockedOptions"),
    )


def _mapping(source: dict[str, Any], key: str) -> dict[str, Any]:
    value = source.get(key)
    if not isinstance(value, dict):
        raise TypeError(f"Shell 分级策略缺少对象字段: {key}")
    return value


def _strings(source: dict[str, Any], key: str) -> frozenset[str]:
    value = source.get(key)
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise ValueError(f"Shell 分级策略字段无效: {key}")
    return frozenset(item.casefold() for item in value)


def _string_map(source: dict[str, Any], key: str) -> dict[str, frozenset[str]]:
    value = _mapping(source, key)
    return {str(name).casefold(): _strings(value, str(name)) for name in value}


def _simple_shell_tokens(command: str) -> list[str] | None:
    stripped = command.strip()
    if (
        not stripped
        or len(stripped) > 8192
        or _SIMPLE_SHELL_META_PATTERN.search(stripped)
        or stripped.count('"') % 2
        or stripped.count("'") % 2
    ):
        return None
    tokens = [token.strip('"\'') for token in _SHELL_TOKEN_PATTERN.findall(stripped)]
    if not tokens or any(not token for token in tokens):
        return None
    if any(token.startswith("@") or "$" in token for token in tokens):
        return None
    return tokens


def _normalized_executable(value: str) -> str:
    executable = value.replace("\\", "/").rsplit("/", 1)[-1].casefold()
    for suffix in (".exe", ".cmd", ".bat", ".ps1"):
        if executable.endswith(suffix):
            return executable[: -len(suffix)]
    return executable


def _references_external_path(tokens: list[str], workspace_path: Path) -> bool:
    workspace = workspace_path.resolve()
    for token in tokens[1:]:
        value = token.strip('"\'')
        if "=" in value:
            value = value.split("=", 1)[1]
        if not value or value.startswith(("http://", "https://")):
            continue
        normalized = value.replace("\\", "/")
        if normalized == "~" or normalized.startswith("~/"):
            return True
        windows_drive_path = bool(re.match(r"^[a-z]:", value, re.IGNORECASE))
        windows_absolute = bool(re.match(r"^[a-z]:[/\\]", value, re.IGNORECASE))
        posix_absolute = normalized.startswith("/") and not value.startswith("/-")
        parent_reference = normalized == ".." or normalized.startswith("../")
        provider_path = bool(
            re.match(r"^[a-z][a-z0-9_-]*:", value, re.IGNORECASE)
        ) and not windows_drive_path
        if provider_path or (windows_drive_path and not windows_absolute):
            return True
        if not (windows_absolute or posix_absolute or parent_reference):
            continue
        candidate = Path(value).expanduser()
        if not candidate.is_absolute():
            if windows_absolute or posix_absolute:
                return True
            candidate = workspace / candidate
        try:
            candidate.resolve().relative_to(workspace)
        except ValueError:
            return True
    return False


def _is_project_script_call(
    arguments: list[str], allowed: frozenset[str]
) -> bool:
    if not arguments:
        return False
    if arguments[0] in allowed:
        return True
    return (
        len(arguments) >= 2
        and arguments[0] in {"run", "run-script"}
        and arguments[1] in allowed
    )


def _all_non_options_allowed(
    arguments: list[str], allowed: frozenset[str]
) -> bool:
    values = [argument for argument in arguments if not argument.startswith("-")]
    return bool(values) and all(value in allowed for value in values)


def _contains_option(arguments: list[str], blocked: frozenset[str]) -> bool:
    return any(
        argument in blocked
        or any(argument.startswith(f"{option}=") for option in blocked)
        for argument in arguments
    )


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
        arguments = tokens[executable_index + 1:]
        if executable in _CATASTROPHIC_COMMANDS:
            return True
        if executable not in _FILE_DELETION_COMMANDS:
            continue
        flags = "".join(
            argument.lstrip("-/")
            for argument in arguments
            if argument.startswith(("-", "/")) and argument not in {"/", "/*"}
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
        if executable in {"remove-item", "ri"} and "recurse" in flags and "force" in flags:
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
            r"[a-z_][a-z0-9_]*=.*", tokens[index], re.IGNORECASE
        ):
            index += 1
    return index if index < len(tokens) else None


def _is_dangerous_root(value: str) -> bool:
    normalized = value.rstrip("\\/") or value
    if value in _DANGEROUS_ROOT_EXPRESSIONS:
        return True
    return bool(re.fullmatch(r"[a-z]:(?:[\\/]\*)?", normalized, re.IGNORECASE))
