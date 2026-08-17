import asyncio
import contextlib
import os
import re
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


_BACKGROUND_PROCESSES: dict[str, _BackgroundProcess] = {}


def shell_tools() -> tuple[FunctionTool, ...]:
    return (
        function_tool(
            name="shell_command",
            description=(
                "在当前工作区使用当前操作系统的默认 Shell 运行非交互命令。"
                "Maven、Gradle 等构建命令默认允许运行 600 秒，也可显式设置 "
                "timeoutSeconds。启动服务器、watch、spring-boot:run 等不会自行"
                "退出的命令必须设置 background=true；工具会返回 processId，之后"
                "使用 shell_process 查看日志或停止进程。"
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
                "查看或停止由 shell_command background=true 启动的后台进程。"
                "status 会返回运行状态和最新日志；stop 会终止完整进程树。"
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
    if _looks_persistent(command) and data.get("background") is not True:
        return (
            "检测到不会自行退出的服务器或监听命令；请设置 background=true，"
            "再使用 shell_process 查询日志或停止进程"
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
    if data.get("background") is True:
        return await _start_background_command(context, command)
    default_timeout = (
        BUILD_TIMEOUT_SECONDS if _looks_like_build(command) else DEFAULT_TIMEOUT_SECONDS
    )
    timeout = min(
        BUILD_TIMEOUT_SECONDS,
        max(1, int(data.get("timeoutSeconds") or default_timeout)),
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
            "服务器或监听命令请使用 background=true"
        ) from None
    output = stdout.decode("utf-8", errors="replace")
    error_output = stderr.decode("utf-8", errors="replace")
    combined = output + (("\n" if output else "") + error_output if error_output else "")
    exit_code = process.returncode
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
