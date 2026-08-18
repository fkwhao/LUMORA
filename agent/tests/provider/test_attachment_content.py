from pathlib import Path

from app.provider.attachment_content import (
    anthropic_attachment_blocks,
    openai_chat_messages,
    responses_attachment_blocks,
)


def _attachment(path: Path, mime_type: str, kind: str = "FILE") -> dict:
    return {
        "attachmentId": "attachment-1",
        "name": path.name,
        "mimeType": mime_type,
        "size": path.stat().st_size,
        "path": str(path),
        "kind": kind,
        "source": "LOCAL_FILE",
    }


def test_openai_chat_inlines_text_without_mutating_source(tmp_path: Path) -> None:
    path = tmp_path / "notes.md"
    path.write_text("attachment body", encoding="utf-8")
    source = {
        "role": "user",
        "content": "summarize",
        "attachments": [_attachment(path, "text/markdown")],
    }

    [message] = openai_chat_messages([source])

    assert source["attachments"]
    assert "attachments" not in message
    assert message["content"][0] == {"type": "text", "text": "summarize"}
    assert "attachment body" in message["content"][1]["text"]


def test_image_is_loaded_only_when_provider_payload_is_built(
    tmp_path: Path,
) -> None:
    path = tmp_path / "capture.png"
    path.write_bytes(b"\x89PNG\r\n\x1a\nexample")
    attachment = _attachment(path, "image/png", "IMAGE")

    [chat] = openai_chat_messages([{
        "role": "user", "content": "inspect", "attachments": [attachment]
    }])
    [anthropic] = anthropic_attachment_blocks([attachment])
    [response] = responses_attachment_blocks([attachment])

    assert chat["content"][1]["image_url"]["url"].startswith(
        "data:image/png;base64,"
    )
    assert anthropic["type"] == "image"
    assert response["type"] == "input_image"


def test_missing_file_degrades_to_unavailable_metadata(tmp_path: Path) -> None:
    path = tmp_path / "deleted.txt"
    path.write_text("gone", encoding="utf-8")
    attachment = _attachment(path, "text/plain")
    path.unlink()

    [message] = openai_chat_messages([{
        "role": "user", "content": "read it", "attachments": [attachment]
    }])

    assert "附件不可用" in message["content"][1]["text"]


def test_pdf_is_routed_to_local_tools_in_every_provider_protocol(
    tmp_path: Path,
) -> None:
    path = tmp_path / "design.pdf"
    path.write_bytes(b"%PDF-1.4\n%%EOF\n")
    attachment = _attachment(path, "application/pdf")

    [chat] = openai_chat_messages([{
        "role": "user", "content": "inspect", "attachments": [attachment]
    }])
    [anthropic] = anthropic_attachment_blocks([attachment])
    [response] = responses_attachment_blocks([attachment])

    for text in (
        chat["content"][1]["text"],
        anthropic["text"],
        response["text"],
    ):
        assert "read_pdf" in text
        assert "attachment-1" in text
    assert anthropic["type"] == "text"
    assert response["type"] == "input_text"
