import asyncio
import contextlib
import hashlib
import json
import os
import re
import shlex
import signal
import subprocess
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.tool.base import (
    FunctionTool,
    ToolCategory,
    ToolContext,
    ToolInput,
    ToolResult,
    function_tool,
)
from app.tool.resource_locks import (
    ResourceAccess,
    ResourceAccessMode,
    workspace_resource_key,
)

MAX_OUTPUT_CHARS = 80_000
BACKGROUND_LOG_CHARS = 40_000
DEFAULT_TIMEOUT_SECONDS = 120
BUILD_TIMEOUT_SECONDS = 600


@dataclass(slots=True)
class _BackgroundProcess:
    process: asyncio.subprocess.Process
    workspace_path: Path
    log_path: Path
    command: str
    stopped: bool = False


@dataclass(frozen=True, slots=True)
class _GitControlState:
    head_reference: str
    head_commit: str
    index_fingerprint: str
    reference_fingerprint: str
    worktree_fingerprint: str
    config_fingerprint: str


_BACKGROUND_PROCESSES: dict[str, _BackgroundProcess] = {}


def shell_tools() -> tuple[FunctionTool, ...]:
    return (
        function_tool(
            name="shell_command",
            description=(
                "在当前工作区使用当前操作系统的默认 Shell 运行非交互命令。"
                "Maven、Gradle 等构建命令默认允许运行 600 秒，也可显式设置 "
                "timeoutSeconds。当前版本不启动后台进程；服务器、watch 等不会"
                "自行退出的命令应改为有界的一次性命令。"
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "command": {"type": "string"},
                    "timeoutSeconds": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 600,
                    },
                    "background": {"type": "boolean"},
                },
                "required": ["command"],
                "additionalProperties": False,
            },
            category=ToolCategory.SHELL,
            read_only=False,
            destructive=_shell_is_destructive,
            concurrency_safe=False,
            resource_accesses=_workspace_write_access,
            execute=_shell_command,
            validate=_validate_shell,
            title=lambda data: str(data.get("command") or "运行命令"),
        ),
        function_tool(
            name="shell_process",
            description=(
                "兼容查询旧版本已经启动的后台进程；当前版本不会创建新的后台"
                "Shell 进程。"
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "processId": {"type": "string"},
                    "action": {"type": "string"},
                },
                "required": ["processId", "action"],
                "additionalProperties": False,
            },
            category=ToolCategory.SHELL,
            read_only=lambda data: data.get("action") == "status",
            destructive=lambda data: data.get("action") == "stop",
            concurrency_safe=False,
            resource_accesses=_shell_process_access,
            execute=_shell_process,
            validate=_validate_shell_process,
            title=lambda data: (
                "停止后台进程"
                if data.get("action") == "stop"
                else "查看后台进程"
            ),
        ),
    )


def _workspace_write_access(
    context: ToolContext,
    _data: ToolInput,
) -> tuple[ResourceAccess, ...]:
    return (
        ResourceAccess(
            workspace_resource_key(context.workspace_path),
            ResourceAccessMode.WRITE,
        ),
    )


def _shell_process_access(
    context: ToolContext,
    data: ToolInput,
) -> tuple[ResourceAccess, ...]:
    mode = (
        ResourceAccessMode.READ
        if data.get("action") == "status"
        else ResourceAccessMode.WRITE
    )
    return (
        ResourceAccess(workspace_resource_key(context.workspace_path), mode),
    )


def _validate_shell(data: ToolInput) -> str | None:
    command = str(data.get("command") or "").strip()
    if not command or len(command) > 20_000:
        return "命令为空或长度超过限制"
    if data.get("background") is True:
        return (
            "当前版本不支持后台 Shell；后台进程会越过任务写锁继续修改文件。"
            "请改用会自行退出的前台命令"
        )
    if _looks_persistent(command):
        return (
            "检测到不会自行退出的服务器或监听命令；当前版本不支持后台 Shell，"
            "请改用会自行退出的有界命令"
        )
    return None


def _validate_shell_process(data: ToolInput) -> str | None:
    process_id = str(data.get("processId") or "").strip()
    if not process_id:
        return "后台进程 ID 不能为空"
    if data.get("action") not in {"status", "stop"}:
        return "后台进程操作必须是 status 或 stop"
    return None


def _shell_is_destructive(data: ToolInput) -> bool:
    command = str(data.get("command") or "")
    return bool(
        re.search(
            r"\b(Remove-Item|Set-Content|Add-Content|Out-File|"
            r"Move-Item|Copy-Item|New-Item|del|erase|rmdir|rd|"
            r"rm|mv|cp|touch|mkdir|git\s+(?:commit|reset|clean|checkout|restore))\b",
            command,
            re.IGNORECASE,
        )
    )


async def _shell_command(context: ToolContext, data: ToolInput) -> ToolResult:
    command = str(data["command"]).strip()
    blocked_git_operation = _blocked_git_workspace_mutation(
        command,
        context.workspace_path,
    )
    if blocked_git_operation:
        metadata = {
            "failureKind": "workspace_control_required",
            "retryable": False,
            "toolExecutionState": "not_started",
            "blockedOperation": blocked_git_operation,
            "nextAction": (
                "请由用户使用 Lumora 标题栏的 Git / Workspace 控件执行"
                " Worktree 或分支切换操作。"
            ),
        }
        return ToolResult(
            content=json.dumps(metadata, ensure_ascii=False),
            is_error=True,
            metadata=metadata,
        )
    if data.get("background") is True:
        metadata = {
            "failureKind": "background_write_not_coordinated",
            "retryable": False,
            "toolExecutionState": "not_started",
            "nextAction": (
                "后台进程会越过任务级写锁继续修改文件；当前版本请改用会自行退出的前台命令。"
            ),
        }
        return ToolResult(
            content=json.dumps(metadata, ensure_ascii=False),
            is_error=True,
            metadata=metadata,
        )
    default_timeout = (
        BUILD_TIMEOUT_SECONDS if _looks_like_build(command) else DEFAULT_TIMEOUT_SECONDS
    )
    timeout = min(
        BUILD_TIMEOUT_SECONDS,
        max(1, int(data.get("timeoutSeconds") or default_timeout)),
    )
    git_control_before = await asyncio.to_thread(
        _git_control_state,
        context.workspace_path,
    )
    process_args = _shell_process_args(command)
    process_options = _process_group_options()
    process = await asyncio.create_subprocess_exec(
        *process_args,
        cwd=context.workspace_path,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        **process_options,
    )
    try:
        stdout, stderr = await asyncio.wait_for(
            process.communicate(),
            timeout=timeout,
        )
    except asyncio.CancelledError:
        await _terminate_process_tree(process)
        raise
    except TimeoutError:
        await _terminate_process_tree(process)
        raise TimeoutError(
            f"命令执行超过 {timeout}s，已终止完整进程树。"
            "请缩小命令范围或提高 timeoutSeconds 后重试"
        ) from None
    output = stdout.decode("utf-8", errors="replace")
    error_output = stderr.decode("utf-8", errors="replace")
    combined = output + (("\n" if output else "") + error_output if error_output else "")
    exit_code = process.returncode
    git_control_after = await asyncio.to_thread(
        _git_control_state,
        context.workspace_path,
    )
    changed_control = _changed_git_control(
        git_control_before,
        git_control_after,
    )
    if changed_control:
        metadata = {
            "exitCode": exit_code,
            "failureKind": "workspace_control_violation",
            "retryable": False,
            "toolExecutionState": "partial_effect_review_required",
            "changedGitControlState": changed_control,
            "nextAction": (
                "命令绕过了 Lumora 的 Git / Workspace 控制面并改变了"
                " Git 元数据；请停止后续写入并由用户审阅恢复。"
            ),
        }
        return ToolResult(
            content=(
                combined[-MAX_OUTPUT_CHARS:]
                + ("\n" if combined else "")
                + json.dumps(metadata, ensure_ascii=False)
            ),
            is_error=True,
            metadata=metadata,
        )
    return ToolResult(
        content=combined[-MAX_OUTPUT_CHARS:],
        is_error=exit_code != 0,
        metadata={"exitCode": exit_code},
    )


async def _start_background_command(
    context: ToolContext,
    command: str,
) -> ToolResult:
    process_id = str(uuid.uuid4())
    log_directory = context.workspace_path / ".lumora" / "processes"
    log_directory.mkdir(parents=True, exist_ok=True)
    log_path = log_directory / f"{process_id}.log"
    log_file = log_path.open("ab")
    try:
        process = await asyncio.create_subprocess_exec(
            *_shell_process_args(command),
            cwd=context.workspace_path,
            stdout=log_file,
            stderr=asyncio.subprocess.STDOUT,
            **_process_group_options(),
        )
    finally:
        log_file.close()
    _BACKGROUND_PROCESSES[process_id] = _BackgroundProcess(
        process=process,
        workspace_path=context.workspace_path.resolve(),
        log_path=log_path,
        command=command,
    )
    return ToolResult(
        content=(
            "后台命令已启动。"
            f"processId={process_id}，osProcessId={process.pid}，"
            f"日志={log_path}。使用 shell_process status 查看启动结果；"
            "完成验证后使用 shell_process stop 释放进程。"
        ),
        metadata={
            "background": True,
            "processId": process_id,
            "osProcessId": process.pid,
            "logPath": str(log_path),
        },
    )


async def _shell_process(context: ToolContext, data: ToolInput) -> ToolResult:
    process_id = str(data["processId"]).strip()
    record = _BACKGROUND_PROCESSES.get(process_id)
    if record is None or record.workspace_path != context.workspace_path.resolve():
        return ToolResult(
            content="未找到当前工作区中的后台进程",
            is_error=True,
            metadata={"processId": process_id},
        )
    action = str(data["action"])
    if action == "stop" and record.process.returncode is None:
        await _terminate_process_tree(record.process)
        record.stopped = True
    running = record.process.returncode is None
    status = "running" if running else ("stopped" if record.stopped else "exited")
    log_tail = _read_log_tail(record.log_path)
    content = (
        f"后台进程状态：{status}；osProcessId={record.process.pid}；"
        f"exitCode={record.process.returncode}；日志={record.log_path}"
    )
    if log_tail:
        content += f"\n\n最新日志：\n{log_tail}"
    metadata: dict[str, Any] = {
        "background": True,
        "processId": process_id,
        "osProcessId": record.process.pid,
        "processStatus": status,
        "logPath": str(record.log_path),
    }
    if record.process.returncode is not None:
        metadata["exitCode"] = record.process.returncode
    return ToolResult(
        content=content,
        is_error=False,
        metadata=metadata,
    )


def _shell_process_args(command: str) -> tuple[str, ...]:
    if os.name == "nt":
        executable = (
            os.environ.get("SystemRoot", "C:\\Windows")
            + "\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
        )
        process_args = (
            executable,
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            command,
        )
        return process_args
    return ("/bin/sh", "-lc", command)


def _process_group_options() -> dict[str, Any]:
    if os.name == "nt":
        return {
            "creationflags": (
                subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW
            )
        }
    return {"start_new_session": True}


async def _terminate_process_tree(process: asyncio.subprocess.Process) -> None:
    if process.returncode is not None:
        return
    if os.name == "nt":
        killer = await asyncio.create_subprocess_exec(
            "taskkill",
            "/PID",
            str(process.pid),
            "/T",
            "/F",
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        await killer.communicate()
    else:
        with contextlib.suppress(ProcessLookupError):
            _signal_process_group(process.pid, signal.SIGTERM)
    try:
        await asyncio.wait_for(process.wait(), timeout=5)
    except TimeoutError:
        if os.name == "nt":
            process.kill()
        else:
            with contextlib.suppress(ProcessLookupError):
                _signal_process_group(
                    process.pid,
                    getattr(signal, "SIGKILL", signal.SIGTERM),
                )
        await process.wait()


def _signal_process_group(process_id: int, signal_number: int) -> None:
    # Windows typeshed 不声明 POSIX-only 的 os.killpg；此分支只会在 POSIX 调用。
    kill_process_group = getattr(os, "killpg")  # noqa: B009
    kill_process_group(process_id, signal_number)


def _read_log_tail(path: Path) -> str:
    try:
        with path.open("rb") as stream:
            stream.seek(0, os.SEEK_END)
            size = stream.tell()
            stream.seek(max(0, size - BACKGROUND_LOG_CHARS))
            return stream.read().decode("utf-8", errors="replace")
    except OSError:
        return ""


def _looks_like_build(command: str) -> bool:
    return bool(
        re.search(
            r"(?:^|[\\/\s])(?:mvnw?|gradlew?)(?:\.cmd|\.bat)?\b|"
            r"\b(?:npm|pnpm|yarn)\s+(?:run\s+)?(?:build|test)\b",
            command,
            re.IGNORECASE,
        )
    )


def _blocked_git_workspace_mutation(
    command: str,
    workspace_path: Path | None = None,
) -> str:
    metadata_access = _direct_git_metadata_access(command, workspace_path)
    if metadata_access:
        return metadata_access
    opaque_runner = _opaque_command_runner(command)
    if opaque_runner:
        return opaque_runner
    for match in re.finditer(
        r'''(?ix)
        (?:^|[\s;&|])(?:&\s*)?
        (?:
            "(?:[^"]*[\\/])?git(?:\.exe)?"
            |'(?:[^']*[\\/])?git(?:\.exe)?'
            |(?:[^\s;&|]*[\\/])?git(?:\.exe)?
        )
        \s+(?P<arguments>[^;&|\r\n]*)
        ''',
        command,
    ):
        try:
            arguments = tuple(shlex.split(match.group("arguments"), posix=True))
        except ValueError:
            return "unparseable git command"
        subcommand, remaining = _git_subcommand(arguments)
        if not subcommand:
            continue
        if _read_only_git_command(subcommand, remaining):
            continue
        return f"git {subcommand}"
    return ""


def _direct_git_metadata_access(
    command: str,
    workspace_path: Path | None,
) -> str:
    normalized_command = command.replace("\\", "/").casefold()
    if re.search(r"(?<![\w.-])\.git(?:/|(?=[\s'\";|&)]|$))", normalized_command):
        return "direct Git metadata access"
    if workspace_path is None:
        return ""

    for git_directory in _git_metadata_directories(workspace_path):
        normalized_directory = str(git_directory).replace("\\", "/").casefold()
        if normalized_directory and normalized_directory in normalized_command:
            return "direct Git metadata access"
    return ""


def _git_metadata_directories(workspace_path: Path) -> tuple[Path, ...]:
    directories: list[Path] = []
    for arguments in (
        ("rev-parse", "--absolute-git-dir"),
        ("rev-parse", "--path-format=absolute", "--git-common-dir"),
    ):
        result = subprocess.run(
            ("git", "-C", str(workspace_path), *arguments),
            capture_output=True,
            check=False,
            text=True,
        )
        if result.returncode != 0:
            continue
        value = result.stdout.strip()
        if value:
            directories.append(Path(value).resolve())
    return tuple(dict.fromkeys(directories))


def _opaque_command_runner(command: str) -> str:
    runner_patterns = (
        (
            "python -c",
            r'''(?ix)(?:^|[\s;&|])(?:&\s*)?
            (?:"[^"]*[\\/]python(?:3(?:\.\d+)*)?(?:\.exe)?"
            |'[^']*[\\/]python(?:3(?:\.\d+)*)?(?:\.exe)?'
            |(?:[^\s;&|]*[\\/])?(?:python(?:3(?:\.\d+)*)?|py)(?:\.exe)?)
            (?:\s+-[^\s]+)*\s+-c(?:\s|$)''',
        ),
        (
            "node/ruby/perl inline runner",
            r'''(?ix)(?:^|[\s;&|])(?:&\s*)?
            (?:[^\s;&|]*[\\/])?(?:node|ruby|perl)(?:\.exe)?
            (?:\s+-[^\s]+)*\s+-e(?:\s|$)''',
        ),
        (
            "PowerShell command runner",
            r'''(?ix)(?:^|[\s;&|])(?:&\s*)?
            (?:"[^"]*[\\/](?:powershell|pwsh)(?:\.exe)?"
            |'[^']*[\\/](?:powershell|pwsh)(?:\.exe)?'
            |(?:[^\s;&|]*[\\/])?(?:powershell|pwsh)(?:\.exe)?)
            [^\r\n;&|]*(?:-c(?:ommand)?|-e(?:ncodedcommand)?)(?:\s|$)''',
        ),
        (
            "cmd /c runner",
            r'''(?ix)(?:^|[\s;&|])(?:"[^"]*[\\/]cmd(?:\.exe)?"
            |(?:[^\s;&|]*[\\/])?cmd(?:\.exe)?)
            (?:\s+/(?![ck](?:\s|$))[^\s]+)*
            \s+/(?:c|k)(?:\s|$)''',
        ),
        (
            "nested shell command runner",
            r'''(?ix)(?:^|[\s;&|])(?:[^\s;&|]*[\\/])?
            (?:bash|sh|zsh)(?:\.exe)?(?:\s+-[^\s]+)*\s+-c(?:\s|$)''',
        ),
        (
            "Python script runner",
            r'''(?ix)(?:^|[\s;&|])(?:&\s*)?
            (?:(?:"[^"]*[\\/]|'[^']*[\\/]|[^\s;&|]*[\\/])?
            (?:python(?:3(?:\.\d+)*)?|py)(?:\.exe)?)
            (?:\s+-[^\s]+)*\s+[^\s;&|"']+\.py(?:\s|$)''',
        ),
        (
            "Node script runner",
            r'''(?ix)(?:^|[\s;&|])(?:&\s*)?
            (?:[^\s;&|]*[\\/])?node(?:\.exe)?
            (?:\s+-[^\s]+)*\s+[^\s;&|"']+\.(?:js|cjs|mjs)(?:\s|$)''',
        ),
        (
            "PowerShell file runner",
            r'''(?ix)(?:^|[\s;&|])(?:&\s*)?
            (?:(?:"[^"]*[\\/]|'[^']*[\\/]|[^\s;&|]*[\\/])?
            (?:powershell|pwsh)(?:\.exe)?)
            [^\r\n;&|]*\s+-f(?:ile)?(?:\s|$)''',
        ),
        (
            "shell script runner",
            r'''(?ix)(?:^|[\s;&|])(?:[^\s;&|]*[\\/])?
            (?:bash|sh|zsh)(?:\.exe)?(?:\s+-[^\s]+)*
            \s+[^\s;&|"']+\.sh(?:\s|$)''',
        ),
    )
    for label, pattern in runner_patterns:
        if re.search(pattern, command):
            return label
    return _direct_script_runner(command)


_ALLOWED_SCRIPT_WRAPPERS = frozenset({
    "gradlew",
    "gradlew.bat",
    "gradlew.cmd",
    "mvnw",
    "mvnw.bat",
    "mvnw.cmd",
    "npm.cmd",
    "pnpm.cmd",
    "yarn.cmd",
})


def _direct_script_runner(command: str) -> str:
    for match in re.finditer(
        r'''(?ix)(?:^|[\s;&|])(?:&\s*)?
        (?P<script>"[^"]+\.(?:ps1|bat|cmd|sh)"
        |'[^']+\.(?:ps1|bat|cmd|sh)'
        |[^\s;&|]+\.(?:ps1|bat|cmd|sh))(?=\s|$)''',
        command,
    ):
        script = match.group("script").strip("'\"")
        if Path(script.replace("\\", "/")).name.casefold() in _ALLOWED_SCRIPT_WRAPPERS:
            continue
        return "direct script runner"
    return ""


_READ_ONLY_GIT_SUBCOMMANDS = frozenset({
    "blame",
    "cat-file",
    "describe",
    "diff",
    "diff-files",
    "diff-index",
    "diff-tree",
    "for-each-ref",
    "grep",
    "help",
    "log",
    "ls-files",
    "ls-tree",
    "merge-base",
    "name-rev",
    "rev-list",
    "rev-parse",
    "shortlog",
    "show",
    "show-ref",
    "status",
    "version",
    "whatchanged",
})


def _git_subcommand(arguments: tuple[str, ...]) -> tuple[str, tuple[str, ...]]:
    consumes_value = {
        "-c",
        "-C",
        "--config-env",
        "--exec-path",
        "--git-dir",
        "--namespace",
        "--super-prefix",
        "--work-tree",
    }
    index = 0
    while index < len(arguments):
        value = arguments[index]
        if value == "--":
            index += 1
            break
        option = value.split("=", 1)[0]
        if option in consumes_value:
            index += 1 if "=" in value else 2
            continue
        if value.startswith("-"):
            index += 1
            continue
        return value.lower(), arguments[index + 1:]
    if index < len(arguments):
        return arguments[index].lower(), arguments[index + 1:]
    return "", ()


def _read_only_git_command(
    subcommand: str,
    arguments: tuple[str, ...],
) -> bool:
    if subcommand in _READ_ONLY_GIT_SUBCOMMANDS:
        return True
    if subcommand == "worktree":
        return bool(arguments) and arguments[0].lower() == "list"
    if subcommand == "branch":
        return _read_only_branch(arguments)
    if subcommand == "tag":
        return _read_only_tag(arguments)
    if subcommand == "remote":
        return not arguments or arguments[0] in {"-v", "--verbose", "show", "get-url"}
    if subcommand == "config":
        return _read_only_config(arguments)
    return False


def _read_only_branch(arguments: tuple[str, ...]) -> bool:
    if not arguments:
        return True
    mutation_flags = {
        "-c", "-C", "-d", "-D", "-f", "-m", "-M",
        "--copy", "--create-reflog", "--delete", "--edit-description",
        "--force", "--move", "--set-upstream-to", "--track",
        "--unset-upstream",
    }
    if any(value.split("=", 1)[0] in mutation_flags for value in arguments):
        return False
    return arguments[0].startswith("-")


def _read_only_tag(arguments: tuple[str, ...]) -> bool:
    if not arguments:
        return True
    mutation_flags = {
        "-a", "-d", "-f", "-s", "-u", "--annotate", "--delete",
        "--force", "--local-user", "--sign",
    }
    if any(value.split("=", 1)[0] in mutation_flags for value in arguments):
        return False
    return arguments[0].startswith("-")


def _read_only_config(arguments: tuple[str, ...]) -> bool:
    mutation_flags = {
        "--add", "--edit", "-e", "--fixed-value", "--rename-section",
        "--remove-section", "--replace-all", "--unset", "--unset-all",
    }
    if any(value.split("=", 1)[0] in mutation_flags for value in arguments):
        return False
    read_flags = {
        "--get", "--get-all", "--get-regexp", "--get-urlmatch",
        "--list", "-l", "--name-only", "--show-origin", "--show-scope",
    }
    if any(value in read_flags for value in arguments):
        return True
    positional = tuple(value for value in arguments if not value.startswith("-"))
    return len(positional) <= 1


def _git_control_state(workspace_path: Path) -> _GitControlState | None:
    def run(*arguments: str) -> subprocess.CompletedProcess[bytes]:
        return subprocess.run(
            ("git", "-C", str(workspace_path), *arguments),
            capture_output=True,
            check=False,
        )

    repository = run("rev-parse", "--show-toplevel")
    if repository.returncode != 0:
        return None

    def output(*arguments: str) -> bytes:
        result = run(*arguments)
        return result.stdout if result.returncode == 0 else b""

    def fingerprint(content: bytes) -> str:
        return hashlib.sha256(content).hexdigest()

    return _GitControlState(
        head_reference=output("symbolic-ref", "-q", "HEAD").decode(
            "utf-8", errors="replace"
        ).strip(),
        head_commit=output("rev-parse", "--verify", "HEAD").decode(
            "ascii", errors="ignore"
        ).strip(),
        index_fingerprint=fingerprint(output("ls-files", "--stage", "-z")),
        reference_fingerprint=fingerprint(output(
            "for-each-ref",
            "--format=%(refname)%00%(objectname)",
        )),
        worktree_fingerprint=fingerprint(output(
            "worktree", "list", "--porcelain", "-z",
        )),
        config_fingerprint=fingerprint(output(
            "config", "--local", "--list", "--null", "--show-origin",
        )),
    )


def _changed_git_control(
    before: _GitControlState | None,
    after: _GitControlState | None,
) -> list[str]:
    if before is None and after is None:
        return []
    if before is None or after is None:
        return ["repository"]
    fields = {
        "headReference": (before.head_reference, after.head_reference),
        "headCommit": (before.head_commit, after.head_commit),
        "index": (before.index_fingerprint, after.index_fingerprint),
        "references": (
            before.reference_fingerprint,
            after.reference_fingerprint,
        ),
        "worktrees": (
            before.worktree_fingerprint,
            after.worktree_fingerprint,
        ),
        "repositoryConfig": (
            before.config_fingerprint,
            after.config_fingerprint,
        ),
    }
    return [name for name, values in fields.items() if values[0] != values[1]]


def _looks_persistent(command: str) -> bool:
    return bool(
        re.search(
            r"\bspring-boot:run\b|\bbootRun\b|"
            r"\b(?:npm|pnpm|yarn)\s+(?:run\s+)?(?:dev|start|watch)\b|"
            r"\b(?:vite|next\s+dev|uvicorn|gunicorn)\b|"
            r"\bflask\s+run\b|\brunserver\b",
            command,
            re.IGNORECASE,
        )
    )
