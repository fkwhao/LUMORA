import asyncio

from app.dto.request.memory_extraction_request import MemoryExtractionRequest
from app.dto.response.chat_completion_response import (
    ChatCompletionResponse,
    TokenUsageResponse,
)
from app.service.memory_extraction_service import MemoryExtractionService


class FakeProvider:
    def __init__(self, message: str) -> None:
        self.message = message

    async def complete(self, *args, **kwargs) -> ChatCompletionResponse:
        del args, kwargs
        return ChatCompletionResponse(
            message=self.message,
            model="example-model",
            usage=TokenUsageResponse(
                promptTokens=100,
                completionTokens=20,
                totalTokens=120,
                inputTokens=12,
                outputTokens=18,
                reasoningTokens=2,
                cacheReadTokens=88,
                cacheMetricsAvailable=True,
            ),
        )


class RecordingProvider(FakeProvider):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.settings = None
        self.prompt = None
        self.messages = None

    async def complete(
        self,
        settings,
        prompt,
        messages,
        **kwargs,
    ) -> ChatCompletionResponse:
        del kwargs
        self.settings = settings
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
    assert response.model == "example-model"
    assert response.usage.total_tokens == 120
    assert response.usage.input_tokens == 12
    assert response.usage.cache_read_tokens == 88


def test_preserves_the_configured_protocol_for_memory_extraction() -> None:
    provider = RecordingProvider('{"candidates":[]}')
    extraction_request = request().model_copy(update={
        "connection": request().connection.model_copy(update={
            "api_format": "anthropic",
            "max_output_tokens": 4096,
            "context_window": 200_000,
            "web_search_enabled": True,
        }),
    })

    asyncio.run(
        MemoryExtractionService(provider).extract(extraction_request)
    )

    assert provider.settings.api_format == "anthropic"
    assert provider.settings.max_output_tokens == 4096
    assert provider.settings.context_window == 200_000
    assert provider.settings.web_search_enabled is False


def test_discards_invalid_short_term_user_scope_but_preserves_usage() -> None:
    provider = FakeProvider("""
    {"candidates":[{"scope":"USER","type":"SUMMARY","retention":"SHORT_TERM","content":"临时目标","dedupeKey":"conversation.temporary_goal","subject":"当前会话","predicate":"temporary_goal","value":"临时目标","structuredData":{},"confidence":0.9,"ttlSeconds":3600}]}
    """)

    response = asyncio.run(MemoryExtractionService(provider).extract(request()))

    assert response.candidates == []
    assert response.usage.total_tokens == 120


def test_accepts_long_term_project_memory_with_importance() -> None:
    provider = FakeProvider("""
    {"candidates":[{"scope":"PROJECT","type":"DECISION","retention":"LONG_TERM","content":"项目使用 SQLite 持久化业务状态","dedupeKey":"project.persistence.database","subject":"项目","predicate":"persistence_database","value":"SQLite","structuredData":{},"confidence":0.95,"importance":0.85,"ttlSeconds":null}]}
    """)

    response = asyncio.run(MemoryExtractionService(provider).extract(request()))

    assert response.candidates[0].scope == "PROJECT"
    assert response.candidates[0].importance == 0.85


def test_discards_invalid_short_term_project_scope_but_preserves_usage() -> None:
    provider = FakeProvider("""
    {"candidates":[{"scope":"PROJECT","type":"SUMMARY","retention":"SHORT_TERM","content":"临时诊断","dedupeKey":"project.temporary_diagnostic","subject":"项目","predicate":"temporary_diagnostic","value":"失败","structuredData":{},"confidence":0.9,"importance":0.2,"ttlSeconds":3600}]}
    """)

    response = asyncio.run(MemoryExtractionService(provider).extract(request()))

    assert response.candidates == []
    assert response.usage.total_tokens == 120


def test_accepts_empty_candidate_list() -> None:
    response = asyncio.run(
        MemoryExtractionService(FakeProvider('{"candidates":[]}'))
        .extract(request())
    )

    assert response.candidates == []


def test_accepts_archiving_an_existing_memory() -> None:
    provider = FakeProvider("""
    {"candidates":[{"action":"ARCHIVE","storage":"MEMORY","scope":"PROJECT","type":"CONSTRAINT","retention":"LONG_TERM","content":"项目只使用 Java","dedupeKey":"project.language.constraint","subject":"当前项目","predicate":"programming_language","value":"Java","targetMemoryId":"memory-java","structuredData":{},"confidence":0.98,"importance":0.8,"ttlSeconds":null}]}
    """)

    response = asyncio.run(MemoryExtractionService(provider).extract(request()))

    assert response.candidates[0].action == "ARCHIVE"
    assert response.candidates[0].target_memory_id == "memory-java"


def test_normalizes_a_negated_update_into_archive() -> None:
    provider = FakeProvider("""
    {"candidates":[{"action":"UPSERT","storage":"MEMORY","scope":"PROJECT","type":"DECISION","retention":"LONG_TERM","content":"项目不再强制统一使用 Java，可以引入其他语言","dedupeKey":"project.language.constraint","subject":"当前项目","predicate":"programming_language","value":"不限制","targetMemoryId":"memory-java","structuredData":{},"confidence":0.98,"importance":0.8,"ttlSeconds":null}]}
    """)
    extraction_request = request().model_copy(update={
        "user_message": "取消当前项目只能使用 Java、不允许其他语言的要求。",
    })

    response = asyncio.run(
        MemoryExtractionService(provider).extract(extraction_request)
    )

    assert response.candidates[0].action == "ARCHIVE"


def test_includes_existing_project_instructions_for_rule_updates(
    tmp_path,
) -> None:
    instruction_dir = tmp_path / ".lumora"
    instruction_dir.mkdir()
    (instruction_dir / "AGENTS.md").write_text(
        "- [project.language.constraint] 项目只使用 Java",
        encoding="utf-8",
    )
    provider = RecordingProvider('{"candidates":[]}')
    extraction_request = request().model_copy(update={
        "workspace_path": str(tmp_path),
    })

    asyncio.run(
        MemoryExtractionService(provider).extract(extraction_request)
    )

    payload = provider.messages[0].content
    assert "existingProjectInstructions" in payload
    assert "project.language.constraint" in payload


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
