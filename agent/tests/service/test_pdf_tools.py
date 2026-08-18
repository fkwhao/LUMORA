import asyncio
from pathlib import Path

import pytest
from app.tool.base import ToolAttachment, ToolContext
from app.tool.pdf_tools import pdf_tools
from app.tool.registry import ToolRegistry
from pypdf import PdfWriter


def test_read_pdf_and_search_pdf_use_only_authorized_attachment(
    tmp_path: Path,
) -> None:
    path = tmp_path / "guide.pdf"
    _write_text_pdf(path, ("Hello LUMORA", "The second page explains queues"))
    context = _context(path)
    registry = ToolRegistry(pdf_tools())

    read = asyncio.run(registry.execute(
        "read_pdf",
        context,
        {"attachmentId": "pdf-1", "startPage": 1, "endPage": 2},
    ))
    search = asyncio.run(registry.execute(
        "search_pdf",
        context,
        {"attachmentId": "pdf-1", "query": "queues"},
    ))

    assert "Hello LUMORA" in read.content
    assert "second page explains queues" in read.content
    assert read.metadata["pageCount"] == 2
    assert read.metadata["ocrRequired"] is False
    assert read.metadata["truncated"] is False
    assert "第 2 页" in search.content
    assert search.metadata["matchCount"] == 1
    assert read.metadata["resourceAccess"] == ({
        "key": f"file:{str(path.resolve()).casefold()}",
        "mode": "read",
    },)


def test_read_pdf_reports_scanned_page_without_persisting_output(
    tmp_path: Path,
) -> None:
    path = tmp_path / "scan.pdf"
    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    with path.open("wb") as stream:
        writer.write(stream)

    result = asyncio.run(ToolRegistry(pdf_tools()).execute(
        "read_pdf",
        _context(path),
        {"attachmentId": "pdf-1"},
    ))

    assert result.metadata["ocrRequired"] is True
    assert result.metadata["truncated"] is False
    assert "需要 OCR" in result.content
    assert sorted(item.name for item in tmp_path.iterdir()) == ["scan.pdf"]


def test_read_pdf_rejects_path_not_registered_as_current_attachment(
    tmp_path: Path,
) -> None:
    path = tmp_path / "private.pdf"
    _write_text_pdf(path, ("not authorized",))

    with pytest.raises(ValueError, match="不属于当前会话附件"):
        asyncio.run(ToolRegistry(pdf_tools()).execute(
            "read_pdf",
            ToolContext(workspace_path=tmp_path),
            {"attachmentId": "pdf-1"},
        ))


def _context(path: Path) -> ToolContext:
    return ToolContext(
        workspace_path=path.parent,
        workspace_scoped=False,
        attachments={
            "pdf-1": ToolAttachment(
                attachment_id="pdf-1",
                name=path.name,
                mime_type="application/pdf",
                path=path,
                size=path.stat().st_size,
            )
        },
    )


def _write_text_pdf(path: Path, page_texts: tuple[str, ...]) -> None:
    page_ids = list(range(3, 3 + len(page_texts)))
    font_id = 3 + len(page_texts)
    content_ids = list(range(font_id + 1, font_id + 1 + len(page_texts)))
    objects: list[bytes] = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        (
            f"<< /Type /Pages /Count {len(page_ids)} /Kids ["
            + " ".join(f"{page_id} 0 R" for page_id in page_ids)
            + "] >>"
        ).encode("ascii"),
    ]
    for content_id in content_ids:
        objects.append((
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            f"/Resources << /Font << /F1 {font_id} 0 R >> >> "
            f"/Contents {content_id} 0 R >>"
        ).encode("ascii"))
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    for text in page_texts:
        escaped = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        stream = f"BT /F1 12 Tf 72 720 Td ({escaped}) Tj ET".encode("ascii")
        objects.append(
            f"<< /Length {len(stream)} >>\nstream\n".encode("ascii")
            + stream
            + b"\nendstream"
        )

    payload = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for number, body in enumerate(objects, start=1):
        offsets.append(len(payload))
        payload.extend(f"{number} 0 obj\n".encode("ascii"))
        payload.extend(body)
        payload.extend(b"\nendobj\n")
    xref_offset = len(payload)
    payload.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    payload.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        payload.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    payload.extend((
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref_offset}\n%%EOF\n"
    ).encode("ascii"))
    path.write_bytes(payload)
