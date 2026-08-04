import asyncio
import json
import os
import re
from pathlib import Path
from typing import Any

from app.tool.base import (
    ToolCategory,
    ToolContext,
    ToolInput,
    ToolResult,
    function_tool,
)
from app.tool.registry import ToolRegistry

MAX_OUTPUT_CHARS = 80_000
MAX_FULL_WRITE_CHARS = 1_000_000
MAX_TEXT_FILE_CHARS = 20_000_000
MAX_LIST_RESULTS = 300
DEFAULT_READ_LINES = 200
MAX_READ_LINES = 400
MAX_READ_OUTPUT_CHARS = 40_000
DEFAULT_SEARCH_RESULTS = 40
MAX_SEARCH_RESULTS = 100
MAX_SEARCH_QUERY_CHARS = 500
MAX_PATCH_TEXT_CHARS = 100_000

def create_default_tool_registry() -> ToolRegistry:
    return ToolRegistry(
        (
            function_tool(
                name="list_files",
                description="列出当前工作区中的文件。结果始终限制在工作区内。",
                input_schema={
                    "type": "object",
                    "properties": {
                        "pattern": {
                            "type": "string",
                            "description": "相对工作区的 glob，例如 **/*.tsx",
                        }
                    },
                    "additionalProperties": False,
                },
                category=ToolCategory.FILESYSTEM,
                read_only=True,
                concurrency_safe=True,
                execute=_list_files,
                validate=_validate_pattern,
                title=lambda data: str(data.get("pattern") or "列出文件"),
            ),
            function_tool(
                name="search_in_file",
                description=(
                    "在工作区 UTF-8 文本文件内搜索普通文本并返回匹配行。"
                    "读取大文件前应先用它定位相关代码。"
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "path": {"type": "string"},
                        "query": {"type": "string"},
                        "caseSensitive": {"type": "boolean"},
                        "maxResults": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": MAX_SEARCH_RESULTS,
                        },
                    },
                    "required": ["path", "query"],
                    "additionalProperties": False,
                },
                category=ToolCategory.FILESYSTEM,
                read_only=True,
                concurrency_safe=True,
                execute=_search_in_file,
                validate=_validate_search,
                title=lambda data: str(data.get("query") or "搜索文件内容"),
            ),
            function_tool(
                name="read_file",
                description=(
                    "分段读取工作区内的 UTF-8 文本文件并返回带行号内容。"
                    "默认读取 200 行，单次最多 400 行；根据 nextStartLine 继续读取。"
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "path": {"type": "string"},
                        "startLine": {"type": "integer", "minimum": 1},
                        "endLine": {"type": "integer", "minimum": 1},
                    },
                    "required": ["path"],
                    "additionalProperties": False,
                },
                category=ToolCategory.FILESYSTEM,
                read_only=True,
                concurrency_safe=True,
                execute=_read_file,
                validate=_validate_line_range,
                title=lambda data: str(data.get("path") or "读取文件"),
            ),
            function_tool(
                name="apply_patch",
                description=(
                    "用唯一匹配的旧文本局部替换工作区内的 UTF-8 文件。"
                    "修改现有文件时优先使用，避免完整读取和重写大文件。"
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "path": {"type": "string"},
                        "oldText": {"type": "string"},
                        "newText": {"type": "string"},
                        "replaceAll": {"type": "boolean"},
                    },
                    "required": ["path", "oldText", "newText"],
                    "additionalProperties": False,
                },
                category=ToolCategory.FILESYSTEM,
                read_only=False,
                destructive=True,
                concurrency_key=_file_concurrency_key,
                execute=_apply_patch,
                validate=_validate_patch,
                title=lambda data: str(data.get("path") or "编辑文件"),
            ),
            function_tool(
                name="write_file",
                description=(
                    "在工作区内新建或明确完整覆盖 UTF-8 文本文件。"
                    "现有文件的局部修改应使用 apply_patch。"
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "path": {"type": "string"},
                        "content": {"type": "string"},
                    },
                    "required": ["path", "content"],
                    "additionalProperties": False,
                },
                category=ToolCategory.FILESYSTEM,
                read_only=False,
                destructive=lambda data: bool(data.get("path")),
                concurrency_key=_file_concurrency_key,
                execute=_write_file,
                title=lambda data: str(data.get("path") or "写入文件"),
            ),
            function_tool(
                name="shell_command",
                description=(
                    "在当前工作区运行非交互命令。Windows 使用 PowerShell，"
                    "其他平台使用系统 shell。"
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "command": {"type": "string"},
                        "timeoutSeconds": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 120,
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
    )


def _validate_pattern(data: ToolInput) -> str | None:
    pattern = str(data.get("pattern") or "**/*").strip()
    if not pattern:
        return "文件匹配模式不能为空"
    return None


def _validate_line_range(data: ToolInput) -> str | None:
    start = int(data.get("startLine") or 1)
    end = data.get("endLine")
    if end is not None and int(end) < start:
        return "结束行不能早于开始行"
    return None


def _validate_search(data: ToolInput) -> str | None:
    query = data.get("query")
    if not isinstance(query, str) or not query:
        return "搜索文本不能为空"
    if len(query) > MAX_SEARCH_QUERY_CHARS:
        return "搜索文本长度超过限制"
    return None


def _validate_patch(data: ToolInput) -> str | None:
    old_text = data.get("oldText")
    new_text = data.get("newText")
    if not isinstance(old_text, str) or not old_text:
        return "待替换文本不能为空"
    if not isinstance(new_text, str):
        return "替换文本必须是字符串"
    if max(len(old_text), len(new_text)) > MAX_PATCH_TEXT_CHARS:
        return "单次补丁文本长度超过限制"
    return None


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


def _file_concurrency_key(context: ToolContext, data: ToolInput) -> str:
    return f"file:{_resolve_path(context, data.get('path'))}"


def _list_files(context: ToolContext, data: ToolInput) -> ToolResult:
    pattern = str(data.get("pattern") or "**/*").strip()
    search_root, relative_pattern = _resolve_glob(context, pattern)
    files = sorted(
        _display_path(context, path)
        for path in search_root.glob(relative_pattern)
        if path.is_file()
    )
    visible = files[:MAX_LIST_RESULTS]
    suffix = (
        f"\n…另有 {len(files) - len(visible)} 个结果未显示"
        if len(files) > len(visible)
        else ""
    )
    return ToolResult(
        content="\n".join(visible) + suffix,
        metadata={"resultCount": len(files)},
    )


def _read_file(context: ToolContext, data: ToolInput) -> ToolResult:
    path = _resolve_path(context, data.get("path"))
    content = _read_text_file(path)
    lines = content.splitlines()
    if not lines:
        return ToolResult(
            content="",
            metadata={
                "path": _display_path(context, path),
                "lineCount": 0,
                "totalLineCount": 0,
                "startLine": 1,
                "endLine": 0,
                "hasMore": False,
                "truncated": False,
            },
        )
    start = max(1, int(data.get("startLine") or 1))
    if start > len(lines):
        raise ValueError(f"起始行超过文件总行数 {len(lines)}")
    requested_end = int(data.get("endLine") or (start + DEFAULT_READ_LINES - 1))
    end = min(len(lines), requested_end, start + MAX_READ_LINES - 1)
    rendered: list[str] = []
    output_chars = 0
    output_limited = False
    for number in range(start, end + 1):
        line = f"{number}: {lines[number - 1]}"
        addition = len(line) + (1 if rendered else 0)
        if rendered and output_chars + addition > MAX_READ_OUTPUT_CHARS:
            output_limited = True
            break
        if not rendered and len(line) > MAX_READ_OUTPUT_CHARS:
            line = line[: MAX_READ_OUTPUT_CHARS - 1] + "…"
            output_limited = True
        rendered.append(line)
        output_chars += len(line) + (1 if len(rendered) > 1 else 0)
        if output_limited:
            break
    actual_end = start + len(rendered) - 1
    has_more = actual_end < len(lines)
    range_limited = end < min(len(lines), requested_end)
    metadata: dict[str, Any] = {
        "path": _display_path(context, path),
        "lineCount": len(rendered),
        "totalLineCount": len(lines),
        "startLine": start,
        "endLine": actual_end,
        "hasMore": has_more,
        "truncated": has_more or range_limited or output_limited,
    }
    if has_more:
        metadata["nextStartLine"] = actual_end + 1
    suffix = (
        f"\n…文件未读完；继续使用 startLine={actual_end + 1}。"
        if has_more
        else ""
    )
    return ToolResult(
        content="\n".join(rendered) + suffix,
        metadata=metadata,
    )


def _search_in_file(context: ToolContext, data: ToolInput) -> ToolResult:
    path = _resolve_path(context, data.get("path"))
    content = _read_text_file(path)
    query = str(data["query"])
    case_sensitive = bool(data.get("caseSensitive", False))
    max_results = min(
        MAX_SEARCH_RESULTS,
        max(1, int(data.get("maxResults") or DEFAULT_SEARCH_RESULTS)),
    )
    needle = query if case_sensitive else query.casefold()
    matches: list[str] = []
    match_count = 0
    output_chars = 0
    for number, line in enumerate(content.splitlines(), start=1):
        haystack = line if case_sensitive else line.casefold()
        if needle not in haystack:
            continue
        match_count += 1
        if len(matches) >= max_results:
            continue
        rendered = f"{number}: {line}"
        if output_chars + len(rendered) + (1 if matches else 0) > MAX_READ_OUTPUT_CHARS:
            continue
        matches.append(rendered)
        output_chars += len(rendered) + (1 if len(matches) > 1 else 0)
    truncated = match_count > len(matches)
    suffix = (
        f"\n…另有 {match_count - len(matches)} 个匹配未显示"
        if truncated
        else ""
    )
    metadata = {
        "path": _display_path(context, path),
        "query": query,
        "matchCount": match_count,
        "resultCount": len(matches),
        "truncated": truncated,
    }
    return ToolResult(
        content=("\n".join(matches) if matches else "未找到匹配内容") + suffix,
        metadata=metadata,
    )


def _apply_patch(context: ToolContext, data: ToolInput) -> ToolResult:
    path = _resolve_path(context, data.get("path"))
    content = _read_text_file(path)
    old_text = _use_file_newlines(str(data["oldText"]), content)
    new_text = _use_file_newlines(str(data["newText"]), content)
    occurrences = content.count(old_text)
    if occurrences == 0:
        raise ValueError("待替换文本不存在，文件可能已发生变化")
    replace_all = bool(data.get("replaceAll", False))
    if occurrences > 1 and not replace_all:
        raise ValueError(
            f"待替换文本匹配到 {occurrences} 处；请提供更完整的上下文以确保唯一匹配"
        )
    updated = content.replace(old_text, new_text, -1 if replace_all else 1)
    replacements = occurrences if replace_all else 1
    _atomic_write_text(path, updated)
    metadata = {
        "path": _display_path(context, path),
        "replacements": replacements,
        "previousLines": len(content.splitlines()),
        "currentLines": len(updated.splitlines()),
    }
    return ToolResult(content=json.dumps(metadata, ensure_ascii=False), metadata=metadata)


def _write_file(context: ToolContext, data: ToolInput) -> ToolResult:
    path = _resolve_path(context, data.get("path"))
    content = data.get("content")
    if not isinstance(content, str):
        raise TypeError("文件内容必须是文本")
    if len(content) > MAX_FULL_WRITE_CHARS:
        raise ValueError("写入内容过大")
    existed = path.exists()
    previous = path.read_text(encoding="utf-8") if existed else ""
    _atomic_write_text(path, content)
    metadata = {
        "path": _display_path(context, path),
        "previousLines": len(previous.splitlines()),
        "currentLines": len(content.splitlines()),
        "created": not existed,
    }
    return ToolResult(content=json.dumps(metadata, ensure_ascii=False), metadata=metadata)


def _read_text_file(path: Path) -> str:
    if not path.is_file():
        raise ValueError("目标文件不存在")
    with path.open("r", encoding="utf-8", newline="") as file:
        content = file.read()
    if len(content) > MAX_TEXT_FILE_CHARS:
        raise ValueError("文件超过 2000 万字符的安全处理上限")
    return content


def _atomic_write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.lumora-tmp")
    with temporary.open("w", encoding="utf-8", newline="") as file:
        file.write(content)
    temporary.replace(path)


def _use_file_newlines(text: str, file_content: str) -> str:
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    newline = "\r\n" if "\r\n" in file_content else "\n"
    return normalized.replace("\n", newline)


async def _shell_command(context: ToolContext, data: ToolInput) -> ToolResult:
    command = str(data["command"]).strip()
    timeout = min(120, max(1, int(data.get("timeoutSeconds") or 30)))
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


def _resolve_path(context: ToolContext, value: Any) -> Path:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("文件路径不能为空")
    candidate = Path(value.strip())
    resolved = (
        candidate.expanduser().resolve()
        if candidate.is_absolute()
        else (context.workspace_path / candidate).resolve()
    )
    try:
        resolved.relative_to(context.workspace_path)
    except ValueError as error:
        if context.allow_external_paths:
            return resolved
        raise ValueError("文件路径超出当前工作区") from error
    return resolved


def _display_path(context: ToolContext, path: Path) -> str:
    try:
        return path.relative_to(context.workspace_path).as_posix()
    except ValueError:
        return str(path)


def _resolve_glob(context: ToolContext, pattern: str) -> tuple[Path, str]:
    """Split a glob into its fixed root and wildcard suffix for external paths."""
    candidate = Path(pattern).expanduser()
    parts = candidate.parts
    wildcard_index = next(
        (index for index, part in enumerate(parts) if any(c in part for c in "*?[")),
        len(parts),
    )
    fixed_parts = parts[:wildcard_index]
    wildcard_parts = parts[wildcard_index:]
    if wildcard_index == len(parts) and fixed_parts:
        wildcard_parts = fixed_parts[-1:]
        fixed_parts = fixed_parts[:-1]
    if candidate.is_absolute():
        fixed = Path(*fixed_parts).resolve()
    else:
        fixed = (context.workspace_path / Path(*fixed_parts)).resolve()
    _resolve_path(context, str(fixed))
    relative_pattern = str(Path(*wildcard_parts)) if wildcard_parts else "*"
    return fixed, relative_pattern
