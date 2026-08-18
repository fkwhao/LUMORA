import asyncio
import re
from pathlib import Path
from typing import Any

from pypdf import PdfReader

from app.tool.base import (
    FunctionTool,
    ToolAttachment,
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
)

MAX_PDF_BYTES = 25 * 1024 * 1024
DEFAULT_READ_PAGES = 5
MAX_READ_PAGES = 10
MAX_READ_OUTPUT_CHARS = 40_000
DEFAULT_SEARCH_PAGES = 100
MAX_SEARCH_PAGES = 200
DEFAULT_SEARCH_RESULTS = 20
MAX_SEARCH_RESULTS = 30
MAX_SEARCH_QUERY_CHARS = 500
SEARCH_SNIPPET_CHARS = 320


def pdf_tools() -> tuple[FunctionTool, ...]:
    return (
        function_tool(
            name="read_pdf",
            description=(
                "按页读取当前会话中已上传 PDF 的可提取文本。"
                "使用 attachmentId 定位附件，默认读取 5 页、单次最多 10 页；"
                "根据返回的 nextStartPage 继续读取。扫描版 PDF 会明确提示需要 OCR。"
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "attachmentId": {
                        "type": "string",
                        "description": "消息中 PDF 附件的 attachmentId",
                    },
                    "startPage": {
                        "type": "integer",
                        "minimum": 1,
                        "description": "从第几页开始，页码从 1 开始",
                    },
                    "endPage": {
                        "type": "integer",
                        "minimum": 1,
                        "description": "读取到第几页（包含该页）",
                    },
                },
                "required": ["attachmentId"],
                "additionalProperties": False,
            },
            category=ToolCategory.FILESYSTEM,
            read_only=True,
            concurrency_safe=True,
            resource_accesses=_pdf_read_access,
            execute=_read_pdf,
            validate=_validate_read,
            title=lambda data: f"读取 PDF · {data.get('startPage') or 1} 页起",
        ),
        function_tool(
            name="search_pdf",
            description=(
                "在当前会话中已上传 PDF 的可提取文本里搜索关键词并返回页码和上下文。"
                "默认扫描 100 页、单次最多 200 页；根据 nextStartPage 继续搜索。"
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "attachmentId": {
                        "type": "string",
                        "description": "消息中 PDF 附件的 attachmentId",
                    },
                    "query": {
                        "type": "string",
                        "description": "要搜索的普通文本",
                    },
                    "startPage": {
                        "type": "integer",
                        "minimum": 1,
                    },
                    "endPage": {
                        "type": "integer",
                        "minimum": 1,
                    },
                    "caseSensitive": {"type": "boolean"},
                    "maxResults": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": MAX_SEARCH_RESULTS,
                    },
                },
                "required": ["attachmentId", "query"],
                "additionalProperties": False,
            },
            category=ToolCategory.FILESYSTEM,
            read_only=True,
            concurrency_safe=True,
            resource_accesses=_pdf_read_access,
            execute=_search_pdf,
            validate=_validate_search,
            title=lambda data: f"搜索 PDF · {data.get('query') or ''}",
        ),
    )


def _validate_read(data: ToolInput) -> str | None:
    start = int(data.get("startPage") or 1)
    end = data.get("endPage")
    if end is not None and int(end) < start:
        return "结束页不能早于开始页"
    return None


def _validate_search(data: ToolInput) -> str | None:
    range_error = _validate_read(data)
    if range_error:
        return range_error
    query = data.get("query")
    if not isinstance(query, str) or not query.strip():
        return "搜索文本不能为空"
    if len(query) > MAX_SEARCH_QUERY_CHARS:
        return "搜索文本长度超过限制"
    return None


def _pdf_read_access(
    context: ToolContext,
    data: ToolInput,
) -> tuple[ResourceAccess, ...]:
    attachment = _resolve_attachment(context, data.get("attachmentId"))
    return (
        ResourceAccess(
            file_resource_key(attachment.path),
            ResourceAccessMode.READ,
        ),
    )


def _read_pdf(context: ToolContext, data: ToolInput) -> ToolResult:
    attachment = _resolve_attachment(context, data.get("attachmentId"))
    reader, version = _open_reader(attachment)
    page_count = len(reader.pages)
    start, end, range_limited = _page_range(
        page_count,
        data,
        default_count=DEFAULT_READ_PAGES,
        maximum_count=MAX_READ_PAGES,
    )

    rendered: list[str] = []
    extracted_chars = 0
    empty_pages = 0
    output_limited = False
    actual_end = start - 1
    for page_number in range(start, end + 1):
        _raise_if_cancelled(context)
        text = _extract_page_text(reader, page_number)
        if not text:
            empty_pages += 1
            text = "[本页没有可提取文本，可能是扫描图片或空白页]"
        else:
            extracted_chars += len(text)
        section = f"--- 第 {page_number} / {page_count} 页 ---\n{text}"
        available = MAX_READ_OUTPUT_CHARS - sum(
            len(part) + 2 for part in rendered
        )
        if available <= 80:
            output_limited = True
            break
        if len(section) > available:
            section = section[: max(1, available - 1)] + "…"
            output_limited = True
        rendered.append(section)
        actual_end = page_number
        if output_limited:
            break

    _require_unchanged(attachment.path, version)
    has_more = actual_end < page_count
    ocr_required = extracted_chars == 0 and empty_pages > 0
    metadata: dict[str, Any] = {
        "attachmentId": attachment.attachment_id,
        "name": attachment.name,
        "pageCount": page_count,
        "startPage": start,
        "endPage": actual_end,
        "hasMore": has_more,
        "truncated": has_more or range_limited or output_limited,
        "outputLimited": output_limited,
        "extractedCharacterCount": extracted_chars,
        "emptyPageCount": empty_pages,
        "ocrRequired": ocr_required,
    }
    suffixes: list[str] = []
    if ocr_required:
        suffixes.append(
            "所选页面没有文本层；这是扫描版 PDF，需要 OCR 或视觉模型才能识别。"
        )
    if has_more:
        metadata["nextStartPage"] = actual_end + 1
        suffixes.append(f"PDF 尚未读完；继续使用 startPage={actual_end + 1}。")
    content = "\n\n".join(rendered)
    if suffixes:
        content = "\n\n".join((content, *suffixes)) if content else "\n".join(suffixes)
    return ToolResult(content=content, metadata=metadata)


def _search_pdf(context: ToolContext, data: ToolInput) -> ToolResult:
    attachment = _resolve_attachment(context, data.get("attachmentId"))
    reader, version = _open_reader(attachment)
    page_count = len(reader.pages)
    start, end, range_limited = _page_range(
        page_count,
        data,
        default_count=DEFAULT_SEARCH_PAGES,
        maximum_count=MAX_SEARCH_PAGES,
    )
    query = str(data["query"]).strip()
    case_sensitive = bool(data.get("caseSensitive", False))
    needle = query if case_sensitive else query.casefold()
    max_results = min(
        MAX_SEARCH_RESULTS,
        max(1, int(data.get("maxResults") or DEFAULT_SEARCH_RESULTS)),
    )

    results: list[str] = []
    match_count = 0
    empty_pages = 0
    scanned_pages = 0
    for page_number in range(start, end + 1):
        _raise_if_cancelled(context)
        text = _extract_page_text(reader, page_number)
        scanned_pages += 1
        if not text:
            empty_pages += 1
            continue
        searchable = re.sub(r"\s+", " ", text).strip()
        haystack = searchable if case_sensitive else searchable.casefold()
        offset = 0
        while True:
            index = haystack.find(needle, offset)
            if index < 0:
                break
            match_count += 1
            if len(results) < max_results:
                results.append(
                    f"第 {page_number} 页："
                    f"{_snippet(searchable, index, len(query))}"
                )
            offset = index + max(1, len(needle))

    _require_unchanged(attachment.path, version)
    has_more_pages = end < page_count
    results_limited = match_count > len(results)
    ocr_required = scanned_pages > 0 and empty_pages == scanned_pages
    metadata: dict[str, Any] = {
        "attachmentId": attachment.attachment_id,
        "name": attachment.name,
        "query": query,
        "pageCount": page_count,
        "startPage": start,
        "endPage": end,
        "scannedPageCount": scanned_pages,
        "matchCount": match_count,
        "resultCount": len(results),
        "hasMore": has_more_pages,
        "truncated": has_more_pages or range_limited or results_limited,
        "ocrRequired": ocr_required,
    }
    suffixes: list[str] = []
    if results_limited:
        suffixes.append(f"另有 {match_count - len(results)} 个匹配未显示。")
    if ocr_required:
        suffixes.append(
            "扫描范围没有文本层；这是扫描版 PDF，需要 OCR 或视觉模型才能搜索。"
        )
    if has_more_pages:
        metadata["nextStartPage"] = end + 1
        suffixes.append(f"尚有页面未搜索；继续使用 startPage={end + 1}。")
    content = "\n".join(results) if results else "未找到匹配内容"
    if suffixes:
        content += "\n" + "\n".join(suffixes)
    return ToolResult(content=content, metadata=metadata)


def _resolve_attachment(
    context: ToolContext,
    value: Any,
) -> ToolAttachment:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("PDF 附件 ID 不能为空")
    attachment = context.attachments.get(value.strip())
    if attachment is None:
        raise ValueError("该 PDF 不属于当前会话附件，或附件引用已经失效")
    if attachment.mime_type.casefold() != "application/pdf":
        raise ValueError("附件不是 PDF 文件")
    return attachment


def _open_reader(attachment: ToolAttachment) -> tuple[PdfReader, str]:
    path = attachment.path.expanduser().resolve(strict=True)
    if not path.is_file() or path.suffix.casefold() != ".pdf":
        raise ValueError("PDF 原文件已移动、删除或类型无效")
    info = path.stat()
    if info.st_size > MAX_PDF_BYTES:
        raise ValueError("PDF 超过 25 MB 的安全处理上限")
    version = _file_version(path)
    try:
        reader = PdfReader(str(path), strict=False)
        if reader.is_encrypted and reader.decrypt("") == 0:
            raise ValueError("PDF 已加密，需要先由用户解锁")
        if not reader.pages:
            raise ValueError("PDF 不包含可读取页面")
    except ValueError:
        raise
    except Exception as error:
        raise ValueError("PDF 结构无效或暂时无法解析") from error
    return reader, version


def _page_range(
    page_count: int,
    data: ToolInput,
    *,
    default_count: int,
    maximum_count: int,
) -> tuple[int, int, bool]:
    start = max(1, int(data.get("startPage") or 1))
    if start > page_count:
        raise ValueError(f"起始页超过 PDF 总页数 {page_count}")
    requested_end = int(data.get("endPage") or (start + default_count - 1))
    maximum_end = start + maximum_count - 1
    end = min(page_count, requested_end, maximum_end)
    return start, end, requested_end > maximum_end


def _extract_page_text(reader: PdfReader, page_number: int) -> str:
    try:
        raw = reader.pages[page_number - 1].extract_text() or ""
    except Exception as error:
        raise ValueError(f"第 {page_number} 页文本提取失败") from error
    return _normalize_text(raw)


def _normalize_text(value: str) -> str:
    value = value.replace("\x00", "").replace("\r\n", "\n").replace("\r", "\n")
    lines = [re.sub(r"[ \t\f\v]+", " ", line).strip() for line in value.split("\n")]
    normalized: list[str] = []
    previous_blank = False
    for line in lines:
        blank = not line
        if blank and previous_blank:
            continue
        normalized.append(line)
        previous_blank = blank
    return "\n".join(normalized).strip()


def _snippet(text: str, index: int, query_length: int) -> str:
    if not text:
        return ""
    half = SEARCH_SNIPPET_CHARS // 2
    start = max(0, index - half)
    end = min(len(text), index + max(query_length, 1) + half)
    prefix = "…" if start > 0 else ""
    suffix = "…" if end < len(text) else ""
    return prefix + text[start:end] + suffix


def _file_version(path: Path) -> str:
    info = path.stat()
    return (
        f"{info.st_dev}:{info.st_ino}:{info.st_size}:"
        f"{info.st_mtime_ns}:{info.st_ctime_ns}"
    )


def _require_unchanged(path: Path, expected: str) -> None:
    try:
        actual = _file_version(path)
    except FileNotFoundError as error:
        raise ValueError("PDF 在读取期间被删除") from error
    if actual != expected:
        raise ValueError("PDF 在读取期间发生变化，请重新读取")


def _raise_if_cancelled(context: ToolContext) -> None:
    if context.cancelled():
        raise asyncio.CancelledError
