import asyncio
from pathlib import Path
from app.dto.request.chat_completion_request import ChatCompletionRequest
from app.prompt.prompt_builder import PromptBuilder
from app.service.chat_service import ChatService
from tests.service.test_chat_service import CapturingHarness, ModelListProvider, _drain

def test_lm010_attachment_remains_accessible_after_history_compaction(tmp_path: Path):
    pdf = tmp_path / "manual.pdf"
    pdf.write_bytes(b"%PDF-1.4\n%%EOF\n")
    harness = CapturingHarness()
    service = ChatService(ModelListProvider(), PromptBuilder(), agent_harness=harness)
    payload = {
        "messages": [{"role": "user", "content": "read PDF", "attachments": [{
            "attachmentId": "pdf-1", "name": "manual.pdf", "mimeType": "application/pdf",
            "size": pdf.stat().st_size, "path": str(pdf), "kind": "FILE", "source": "LOCAL_FILE"
        }]}],
        "connection": {"providerName": "Test", "baseUrl": "https://test.invalid/v1",
            "model": "test-model", "apiKey": "test-only", "apiFormat": "chat-completions"},
    }
    first = ChatCompletionRequest.model_validate(payload)
    asyncio.run(_drain(service.stream(first, "issue-pdf-before")))
    assert "pdf-1" in harness.tool_context.attachments
    first_tools = [tool["function"]["name"] for tool in harness.prompt.tools]
    # Core retains a metadata-only manifest when the original text leaves context.
    references = payload["messages"][0]["attachments"]
    payload["messages"] = [
        {"role": "user", "content": "PDF references retained from this branch", "attachments": references},
        {"role": "user", "content": "read another page from the earlier PDF"},
    ]
    payload["conversationSummary"] = "Previously uploaded PDF pdf-1 manual.pdf is available"
    second = ChatCompletionRequest.model_validate(payload)
    asyncio.run(_drain(service.stream(second, "issue-pdf-after")))
    after_tools = [tool["function"]["name"] for tool in harness.prompt.tools]
    print("REPRO LM-010", {"before_read_pdf": "read_pdf" in first_tools,
        "after_read_pdf": "read_pdf" in after_tools, "attachment_ids": list(harness.tool_context.attachments),
        "file_still_exists": pdf.exists()})
    assert "pdf-1" in harness.tool_context.attachments
    assert "read_pdf" in first_tools
    assert "read_pdf" in after_tools

    # An unrelated request must not inherit references from another branch.
    payload["messages"] = [{"role": "user", "content": "a different branch without the PDF"}]
    payload.pop("conversationSummary")
    asyncio.run(_drain(service.stream(ChatCompletionRequest.model_validate(payload), "issue-pdf-other")))
    assert "pdf-1" not in harness.tool_context.attachments
    assert "read_pdf" not in [tool["function"]["name"] for tool in harness.prompt.tools]
