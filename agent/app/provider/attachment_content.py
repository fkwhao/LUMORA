import base64
from html import escape
from pathlib import Path
from typing import Any, Literal

_MAX_IMAGE_BYTES = 20 * 1024 * 1024
_MAX_FILE_BYTES = 25 * 1024 * 1024
_MAX_INLINE_TEXT_BYTES = 2 * 1024 * 1024
_TEXT_EXTENSIONS = {
    ".c", ".cc", ".conf", ".cpp", ".css", ".csv", ".go", ".h",
    ".hpp", ".html", ".ini", ".java", ".js", ".json", ".jsx",
    ".kt", ".kts", ".log", ".md", ".properties", ".py", ".rb",
    ".rs", ".sh", ".sql", ".toml", ".ts", ".tsx", ".txt", ".vue",
    ".xml", ".yaml", ".yml",
}


def openai_chat_messages(
    messages: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    return [_openai_chat_message(message) for message in messages]


def anthropic_attachment_blocks(
    attachments: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    for raw in attachments:
        if _is_pdf(raw):
            blocks.append(_anthropic_text(_pdf_tool_reference(raw)))
            continue
        loaded = _load(raw)
        if loaded.error:
            blocks.append(_anthropic_text(loaded.error))
        elif loaded.is_image:
            blocks.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": loaded.mime_type,
                    "data": loaded.base64_data,
                },
            })
        elif loaded.text is not None:
            blocks.append(_anthropic_text(_text_envelope(loaded)))
        else:
            blocks.append(_anthropic_text(_binary_reference(loaded)))
    return blocks


def responses_attachment_blocks(
    attachments: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    for raw in attachments:
        if _is_pdf(raw):
            blocks.append({
                "type": "input_text",
                "text": _pdf_tool_reference(raw),
            })
            continue
        loaded = _load(raw)
        if loaded.error:
            blocks.append({"type": "input_text", "text": loaded.error})
        elif loaded.is_image:
            blocks.append({
                "type": "input_image",
                "image_url": loaded.data_url,
            })
        elif loaded.text is not None:
            blocks.append({
                "type": "input_text",
                "text": _text_envelope(loaded),
            })
        else:
            blocks.append({
                "type": "input_file",
                "filename": loaded.name,
                "file_data": loaded.data_url,
            })
    return blocks


class _LoadedAttachment:
    def __init__(
        self,
        *,
        name: str,
        mime_type: str,
        path: str,
        data: bytes = b"",
        text: str | None = None,
        truncated: bool = False,
        error: str = "",
    ) -> None:
        self.name = name
        self.mime_type = mime_type
        self.path = path
        self.data = data
        self.text = text
        self.truncated = truncated
        self.error = error

    @property
    def is_image(self) -> bool:
        return self.mime_type.startswith("image/")

    @property
    def base64_data(self) -> str:
        return base64.b64encode(self.data).decode("ascii")

    @property
    def data_url(self) -> str:
        return f"data:{self.mime_type};base64,{self.base64_data}"


def _load(raw: dict[str, Any]) -> _LoadedAttachment:
    name = str(raw.get("name") or "附件")
    mime_type = str(raw.get("mimeType") or "application/octet-stream")
    raw_path = str(raw.get("path") or "")
    kind = str(raw.get("kind") or "FILE")
    try:
        path = Path(raw_path).expanduser().resolve(strict=True)
        if not path.is_file():
            raise OSError("not a file")
        size = path.stat().st_size
        maximum = _MAX_IMAGE_BYTES if kind == "IMAGE" else _MAX_FILE_BYTES
        if size > maximum:
            raise OSError("file is too large")
        if _is_text(mime_type, path):
            with path.open("rb") as handle:
                data = handle.read(_MAX_INLINE_TEXT_BYTES + 1)
            truncated = len(data) > _MAX_INLINE_TEXT_BYTES
            data = data[:_MAX_INLINE_TEXT_BYTES]
            return _LoadedAttachment(
                name=name,
                mime_type=mime_type,
                path=str(path),
                text=data.decode("utf-8-sig", errors="replace"),
                truncated=truncated,
            )
        return _LoadedAttachment(
            name=name,
            mime_type=mime_type,
            path=str(path),
            data=path.read_bytes(),
        )
    except (OSError, RuntimeError, ValueError):
        return _LoadedAttachment(
            name=name,
            mime_type=mime_type,
            path=raw_path,
            error=f"[附件不可用：{name}（原文件已移动、删除或无法读取）]",
        )


def _openai_chat_message(message: dict[str, Any]) -> dict[str, Any]:
    normalized = {key: value for key, value in message.items()
                  if key != "attachments"}
    attachments = message.get("attachments") or []
    if not attachments:
        return normalized
    content = message.get("content")
    blocks: list[dict[str, Any]] = []
    if content:
        blocks.append({"type": "text", "text": str(content)})
    for raw in attachments:
        if _is_pdf(raw):
            blocks.append({"type": "text", "text": _pdf_tool_reference(raw)})
            continue
        loaded = _load(raw)
        if loaded.error:
            blocks.append({"type": "text", "text": loaded.error})
        elif loaded.is_image:
            blocks.append({
                "type": "image_url",
                "image_url": {"url": loaded.data_url},
            })
        elif loaded.text is not None:
            blocks.append({"type": "text", "text": _text_envelope(loaded)})
        else:
            blocks.append({"type": "text", "text": _binary_reference(loaded)})
    normalized["content"] = blocks
    return normalized


def _is_text(mime_type: str, path: Path) -> bool:
    return (
        mime_type.startswith("text/")
        or mime_type in {
            "application/json", "application/ld+json", "application/xml",
            "application/yaml", "application/x-yaml",
        }
        or path.suffix.casefold() in _TEXT_EXTENSIONS
    )


def _text_envelope(attachment: _LoadedAttachment) -> str:
    suffix = "\n[内容超过 2 MB，已截断]" if attachment.truncated else ""
    return (
        f'<attachment name="{attachment.name}" '
        f'mime_type="{attachment.mime_type}">\n'
        f"{attachment.text or ''}{suffix}\n</attachment>"
    )


def _binary_reference(attachment: _LoadedAttachment) -> str:
    return (
        f"[附件：{attachment.name}，类型 {attachment.mime_type}，"
        "当前模型协议不支持直接内联该二进制文件。]"
    )


def _is_pdf(raw: dict[str, Any]) -> bool:
    return str(raw.get("mimeType") or "").casefold() == "application/pdf"


def _pdf_tool_reference(raw: dict[str, Any]) -> str:
    attachment_id = escape(str(raw.get("attachmentId") or ""), quote=True)
    name = escape(str(raw.get("name") or "PDF 附件"), quote=True)
    return (
        f'<pdf_attachment attachment_id="{attachment_id}" name="{name}">\n'
        "该 PDF 通过本地只读工具提供。需要查看内容时调用 read_pdf；"
        "需要定位关键词时调用 search_pdf。不要声称无法访问，也不要猜测文件内容。\n"
        "</pdf_attachment>"
    )


def _anthropic_text(text: str) -> dict[str, Literal["text"] | str]:
    return {"type": "text", "text": text}
