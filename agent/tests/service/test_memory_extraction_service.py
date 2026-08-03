import asyncio

import pytest

from app.dto.request.memory_extraction_request import MemoryExtractionRequest
from app.dto.response.chat_completion_response import (
    ChatCompletionResponse,
    TokenUsageResponse,
)
from app.service.chat_service import ModelProviderError
from app.service.memory_extraction_service import MemoryExtractionService


class FakeProvider:
    def __init__(self, message: str) -> None:
        self.message = message

    async def complete(self, *args, **kwargs) -> ChatCompletionResponse:
        del args, kwargs
        return ChatCompletionResponse(
            message=self.message,
            model="example-model",
            usage=TokenUsageResponse(),
        )


class RecordingProvider(FakeProvider):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.prompt = None
        self.messages = None

    async def complete(
        self,
        settings,
        prompt,
        messages,
        **kwargs,
    ) -> ChatCompletionResponse:
        del settings, kwargs
        self.prompt = prompt
        self.messages = messages
        return await super().complete()


def request() -> MemoryExtractionRequest:
    return MemoryExtractionRequest.model_validate({
        "userMessage": "以后回答简洁一点。",
        "assistantMessage": "好的，我以后会保持简洁。",
        "connection": {
            "providerName": "OpenAI Compatible",
            "baseUrl": "https://example.com/v1",
            "model": "example-model",
            "apiKey": "secret",
        },
    })


def test_extracts_valid_long_term_candidate_from_fenced_json() -> None:
    provider = FakeProvider("""```json
    {"candidates":[{"scope":"USER","type":"PREFERENCE","retention":"LONG_TERM","content":"用户偏好简洁回答","dedupeKey":"user.response.style","subject":"用户","predicate":"response_style","value":"简洁","structuredData":{"style":"concise"},"confidence":0.95,"ttlSeconds":604800}]}
    ```""")

    response = asyncio.run(MemoryExtractionService(provider).extract(request()))

    assert len(response.candidates) == 1
    assert response.candidates[0].content == "用户偏好简洁回答"
    assert response.candidates[0].dedupe_key == "user.response.style"
    assert response.candidates[0].ttl_seconds is None


def test_rejects_short_term_user_scope() -> None:
    provider = FakeProvider("""
    {"candidates":[{"scope":"USER","type":"SUMMARY","retention":"SHORT_TERM","content":"临时目标","dedupeKey":"conversation.temporary_goal","subject":"当前会话","predicate":"temporary_goal","value":"临时目标","structuredData":{},"confidence":0.9,"ttlSeconds":3600}]}
    """)

    with pytest.raises(ModelProviderError):
        asyncio.run(MemoryExtractionService(provider).extract(request()))


def test_accepts_empty_candidate_list() -> None:
    response = asyncio.run(
        MemoryExtractionService(FakeProvider('{"candidates":[]}'))
        .extract(request())
    )

    assert response.candidates == []


def test_prompt_requires_legacy_memory_semantic_backfill() -> None:
    provider = RecordingProvider('{"candidates":[]}')
    extraction_request = request().model_copy(update={
        "existing_memory_summary": (
            "id=legacy-id; scope=USER; type=PREFERENCE; key=; "
            "subject=; predicate=; value=; content=用户偏好简洁回答"
        ),
    })

    asyncio.run(
        MemoryExtractionService(provider).extract(extraction_request)
    )

    system_prompt = provider.prompt.system_prompt
    assert "仍必须返回该候选" in system_prompt
    assert "targetMemoryId" in system_prompt
    assert "无需重复记录" in system_prompt
    assert "legacy-id" in provider.messages[0].content
