import hashlib
import json
import os
import stat
import tempfile
from pathlib import Path
from typing import Any

from app.execution.merge import merge_text
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
    file_resource_key,
    workspace_resource_key,
)

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


def filesystem_tools() -> tuple[FunctionTool, ...]:
    return (
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
            resource_accesses=_workspace_read_access,
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
            resource_accesses=_file_read_access,
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
            resource_accesses=_file_read_access,
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
            resource_accesses=_file_write_access,
            execute=_apply_patch,
            validate=_validate_patch,
            title=lambda data: str(data.get("path") or "编辑文件"),
        ),
        function_tool(
            name="write_file",
            description=(
                "在工作区内新建或明确完整覆盖 UTF-8 文本文件。"
                "现有文件的局部修改应使用 apply_patch；conflictPolicy=merge 可基于"
                "读取基线自动合并不重叠修改，重叠修改会返回人工解决信息。"
                "read_file 返回的 observationId 可作为 baseObservationId 显式指定基线。"
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "content": {"type": "string"},
                    "conflictPolicy": {
                        "type": "string",
                        "enum": ["reject", "merge"],
                        "default": "reject",
                    },
                    "baseObservationId": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 80,
                    },
                },
                "required": ["path", "content"],
                "additionalProperties": False,
            },
            category=ToolCategory.FILESYSTEM,
            read_only=False,
            destructive=lambda data: bool(data.get("path")),
            resource_accesses=_file_write_access,
            execute=_write_file,
            validate=_validate_write_file,
            title=lambda data: str(data.get("path") or "写入文件"),
        ),
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


def _validate_write_file(data: ToolInput) -> str | None:
    if data.get("conflictPolicy", "reject") not in {"reject", "merge"}:
        return "conflictPolicy 必须是 reject 或 merge"
    return None


def _workspace_read_access(
    context: ToolContext,
    _data: ToolInput,
) -> tuple[ResourceAccess, ...]:
    return (
        ResourceAccess(
            workspace_resource_key(context.workspace_path),
            ResourceAccessMode.READ,
        ),
    )


def _file_access(
    context: ToolContext,
    data: ToolInput,
    mode: ResourceAccessMode,
) -> tuple[ResourceAccess, ...]:
    path = _resolve_path(context, data.get("path"))
    return (
        ResourceAccess(
            workspace_resource_key(context.workspace_path),
            ResourceAccessMode.READ,
        ),
        ResourceAccess(file_resource_key(path), mode),
    )


def _file_read_access(
    context: ToolContext,
    data: ToolInput,
) -> tuple[ResourceAccess, ...]:
    return _file_access(context, data, ResourceAccessMode.READ)


def _file_write_access(
    context: ToolContext,
    data: ToolInput,
) -> tuple[ResourceAccess, ...]:
    return _file_access(context, data, ResourceAccessMode.WRITE)


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
    content, version = _read_text_file(path)
    observation_id = _observe_file(context, path, version, content)
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
                "observationId": observation_id,
                "resourceVersion": version,
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
        "observationId": observation_id,
        "resourceVersion": version,
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
    content, version = _read_text_file(path)
    observation_id = _observe_file(context, path, version, content)
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
        "observationId": observation_id,
        "resourceVersion": version,
    }
    return ToolResult(
        content=("\n".join(matches) if matches else "未找到匹配内容") + suffix,
        metadata=metadata,
    )


def _apply_patch(context: ToolContext, data: ToolInput) -> ToolResult:
    path = _resolve_path(context, data.get("path"))
    content, version = _read_text_file(path)
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
    _atomic_write_text(path, updated, expected_version=version)
    current_version = _file_version(path)
    observation_id = _observe_file(context, path, current_version, updated)
    metadata = {
        "path": _display_path(context, path),
        "replacements": replacements,
        "previousLines": len(content.splitlines()),
        "currentLines": len(updated.splitlines()),
        "observationId": observation_id,
        "resourceVersion": current_version,
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
    write_resolution = "created" if not existed else "direct"
    base_observation_id = str(
        data.get("baseObservationId") or ""
    ).strip() or None
    used_observation_id: str | None = None
    observed_version: str | None = None
    base: str | None = None
    if existed:
        current_version = _file_version(path)
        previous, verified_version = _read_text_file(path)
        if verified_version != current_version:
            raise ValueError("文件在写入前发生变化，请重新读取后再试")
        owner_id = context.resource_owner_id
        observations = context.resource_observations
        resource_key = file_resource_key(path)
        observation = (
            observations.observation(
                owner_id,
                resource_key,
                base_observation_id,
            )
            if owner_id and observations is not None
            else None
        )
        if owner_id and observations is not None and observation is None:
            if base_observation_id is not None:
                return _human_merge_required(
                    context,
                    path,
                    None,
                    previous,
                    content,
                    (),
                    reason="指定的读取观察不存在、已过期或不属于当前 Agent",
                    write_resolution="baseline_unavailable",
                    base_observation_id=base_observation_id,
                    base_version=None,
                    current_version=verified_version,
                )
            raise ValueError("覆盖已有文件前必须先读取该文件")
        if observation is not None:
            used_observation_id = observation.observation_id
            observed_version = observation.version
            base = observation.content
        if observed_version is not None and observed_version != verified_version:
            if data.get("conflictPolicy", "reject") != "merge":
                raise ValueError(
                    "文件已被其他任务修改，或被其他 Agent 修改，请重新读取后再试"
                )
            if base is None:
                return _human_merge_required(
                    context,
                    path,
                    None,
                    previous,
                    content,
                    (),
                    reason="读取观察未保留完整基线，无法安全自动合并",
                    write_resolution="baseline_unavailable",
                    base_observation_id=used_observation_id,
                    base_version=observed_version,
                    current_version=verified_version,
                )
            merge = merge_text(base, previous, content)
            if not merge.merged or merge.content is None:
                return _human_merge_required(
                    context,
                    path,
                    base,
                    previous,
                    content,
                    tuple(hunk.metadata() for hunk in merge.conflicts),
                    reason="当前修改与待写入修改发生重叠",
                    write_resolution="manual_merge_required",
                    base_observation_id=used_observation_id,
                    base_version=observed_version,
                    current_version=verified_version,
                )
            content = merge.content
            write_resolution = (
                "already_current" if content == previous else "auto_merged"
            )
        elif content == previous:
            write_resolution = "already_current"
        expected_version: str | None = verified_version
    else:
        previous = ""
        expected_version = None
    if write_resolution != "already_current":
        _atomic_write_text(path, content, expected_version=expected_version)
    final_version = _file_version(path)
    observation_id = _observe_file(context, path, final_version, content)
    metadata = {
        "path": _display_path(context, path),
        "previousLines": len(previous.splitlines()),
        "currentLines": len(content.splitlines()),
        "created": not existed,
        "mergeApplied": write_resolution == "auto_merged",
        "writeResolution": write_resolution,
        "baseObservationId": used_observation_id,
        "observationId": observation_id,
        "baseVersion": observed_version,
        "resourceVersion": final_version,
    }
    return ToolResult(content=json.dumps(metadata, ensure_ascii=False), metadata=metadata)


def _read_text_file(path: Path) -> tuple[str, str]:
    if not path.is_file():
        raise ValueError("目标文件不存在")
    before = _file_version(path)
    with path.open("r", encoding="utf-8", newline="") as file:
        content = file.read()
    after = _file_version(path)
    if before != after:
        raise ValueError("文件在读取期间发生变化，请重新读取")
    if len(content) > MAX_TEXT_FILE_CHARS:
        raise ValueError("文件超过 2000 万字符的安全处理上限")
    return content, before


def _file_version(path: Path) -> str:
    info = path.stat()
    return (
        f"{info.st_dev}:{info.st_ino}:{info.st_size}:"
        f"{info.st_mtime_ns}:{info.st_ctime_ns}"
    )


def _observe_file(
    context: ToolContext,
    path: Path,
    version: str,
    content: str | None = None,
) -> str | None:
    observations = context.resource_observations
    if observations is not None:
        merge_baseline = (
            content
            if content is not None and len(content) <= MAX_FULL_WRITE_CHARS
            else None
        )
        observation = observations.observe(
            context.resource_owner_id,
            file_resource_key(path),
            version,
            merge_baseline,
        )
        return (
            observation.observation_id if observation is not None else None
        )
    return None


def _human_merge_required(
    context: ToolContext,
    path: Path,
    base: str | None,
    current: str,
    proposed: str,
    conflicts: tuple[dict[str, object], ...],
    *,
    reason: str,
    write_resolution: str,
    base_observation_id: str | None,
    base_version: str | None,
    current_version: str,
) -> ToolResult:
    metadata = {
        "failureKind": "human_merge_required",
        "retryable": False,
        "toolExecutionState": "not_started",
        "path": _display_path(context, path),
        "reason": reason,
        "writeResolution": write_resolution,
        "mergeApplied": False,
        "conflictHunks": conflicts,
        "baseObservationId": base_observation_id,
        "baseVersion": base_version,
        "resourceVersion": current_version,
        "baseHash": _content_hash(base) if base is not None else None,
        "currentHash": _content_hash(current),
        "proposedHash": _content_hash(proposed),
        "nextAction": (
            "请查看 conflictHunks，读取文件最新内容后人工整合，再以新的完整内容重试。"
        ),
    }
    return ToolResult(
        content=json.dumps(metadata, ensure_ascii=False),
        is_error=True,
        metadata=metadata,
    )


def _content_hash(value: str) -> str:
    return "sha256:" + hashlib.sha256(value.encode("utf-8")).hexdigest()


def _require_current_observation(
    context: ToolContext,
    path: Path,
    current_version: str,
) -> None:
    owner_id = context.resource_owner_id
    if not owner_id or context.resource_observations is None:
        return
    expected = context.resource_observations.expected(
        owner_id,
        file_resource_key(path),
    )
    if expected is None:
        raise ValueError("覆盖已有文件前必须先读取该文件")
    if expected != current_version:
        raise ValueError("文件已被其他任务修改，或被其他 Agent 修改，请重新读取后再试")


def _atomic_write_text(
    path: Path,
    content: str,
    *,
    expected_version: str | None,
) -> None:
    """Publish one complete file while enforcing the caller's observation.

    ``None`` means create-if-absent. An existing version means replace only
    when the target still matches the content observed inside the resource
    lock. A unique sibling temporary file avoids collisions with another
    Runtime or a crashed earlier write.
    """

    path.parent.mkdir(parents=True, exist_ok=True)
    original_mode: int | None = None
    if expected_version is not None:
        try:
            original_mode = stat.S_IMODE(path.stat().st_mode)
        except FileNotFoundError:
            pass

    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            newline="",
            prefix=f".{path.name}.",
            suffix=".lumora-tmp",
            dir=path.parent,
            delete=False,
        ) as file:
            temporary = Path(file.name)
            file.write(content)
            file.flush()
            os.fsync(file.fileno())

        if original_mode is not None:
            os.chmod(temporary, original_mode)

        if expected_version is None:
            try:
                # Linking a prepared sibling is an atomic create-if-absent.
                os.link(temporary, path)
            except FileExistsError as error:
                raise ValueError(
                    "目标文件已被其他任务创建，请先读取后再试"
                ) from error
            temporary.unlink()
            temporary = None
            return

        try:
            actual_version = _file_version(path)
        except FileNotFoundError as error:
            raise ValueError(
                "文件在提交写入前发生变化，请重新读取后再试"
            ) from error
        if actual_version != expected_version:
            raise ValueError("文件在提交写入前发生变化，请重新读取后再试")
        os.replace(temporary, path)
        temporary = None
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def _use_file_newlines(text: str, file_content: str) -> str:
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    newline = "\r\n" if "\r\n" in file_content else "\n"
    return normalized.replace("\n", newline)


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
