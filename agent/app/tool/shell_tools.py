import asyncio
import os
import re

from app.tool.base import (
    FunctionTool,
    ToolCategory,
    ToolContext,
    ToolInput,
    ToolResult,
    function_tool,
)

MAX_OUTPUT_CHARS = 80_000


def shell_tools() -> tuple[FunctionTool, ...]:
    return (
        function_tool(
            name="shell_command",
            description=(
                "在当前工作区使用当前操作系统的默认 Shell 运行非交互命令。"
                "下载、构建等长命令应显式设置 timeoutSeconds。"
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
                },
                "required": ["command"],
                "additionalProperties": False,
            },
            category=ToolCategory.SHELL,
            read_only=False,
            destructive=_shell_is_destructive,
            concurrency_safe=False,
            concurrency_key=lambda context, _data: (
                f"workspace:{context.workspace_path}"
            ),
            execute=_shell_command,
            validate=_validate_shell,
            title=lambda data: str(data.get("command") or "运行命令"),
        ),
    )


def _validate_shell(data: ToolInput) -> str | None:
    command = str(data.get("command") or "").strip()
    if not command or len(command) > 20_000:
        return "命令为空或长度超过限制"
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
    timeout = min(600, max(1, int(data.get("timeoutSeconds") or 120)))
    process_args: tuple[str, ...]
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
    else:
        process_args = ("/bin/sh", "-lc", command)
    process = await asyncio.create_subprocess_exec(
        *process_args,
        cwd=context.workspace_path,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(
            process.communicate(),
            timeout=timeout,
        )
    except asyncio.CancelledError:
        process.kill()
        await process.communicate()
        raise
    except TimeoutError:
        process.kill()
        await process.communicate()
        raise TimeoutError(f"命令执行超过 {timeout}s，已终止") from None
    output = stdout.decode("utf-8", errors="replace")
    error_output = stderr.decode("utf-8", errors="replace")
    combined = output + (("\n" if output else "") + error_output if error_output else "")
    exit_code = process.returncode
    return ToolResult(
        content=combined[-MAX_OUTPUT_CHARS:],
        is_error=exit_code != 0,
        metadata={"exitCode": exit_code},
    )
