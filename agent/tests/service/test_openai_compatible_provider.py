import asyncio
import json

from app.dto.request.chat_completion_request import ChatMessageRequest
from app.model.model_connection_settings import ModelConnectionSettings
from app.prompt.prompt_builder import PromptBuilder
from app.prompt.prompt_context import PromptContext
from app.provider.openai_compatible_provider import OpenAICompatibleProvider


class _StreamingResponse:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    def raise_for_status(self) -> None:
        return None

    async def aiter_lines(self):
        yield "data: " + json.dumps({
            "model": "example-model",
            "choices": [{"delta": {"content": "完成"}}],
        }, ensure_ascii=False)
        yield "data: " + json.dumps({
            "model": "example-model",
            "choices": [],
            "usage": {
                "prompt_tokens": 4,
                "completion_tokens": 2,
                "total_tokens": 6,
            },
        })
        yield "data: [DONE]"
        yield "data: this-must-not-be-parsed"


class _StreamingClient:
    def __init__(self, *_args, **_kwargs) -> None:
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    def stream(self, *_args, **_kwargs):
        return _StreamingResponse()


class _CompletionResponse:
    def raise_for_status(self) -> None:
        return None

    def json(self):
        return {
            "model": "example-model",
            "choices": [{"message": {"content": "done"}}],
            "usage": {
                "prompt_tokens": 2,
                "completion_tokens": 1,
                "total_tokens": 3,
            },
        }


class _CompletionClient:
    body = None

    def __init__(self, *_args, **_kwargs) -> None:
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def post(self, *_args, **kwargs):
        _CompletionClient.body = kwargs["json"]
        return _CompletionResponse()


def test_prompt_assembly_routes_context_and_tools_to_api_fields() -> None:
    provider = OpenAICompatibleProvider()
    prompt = PromptBuilder().build(
        PromptContext(
            memory_summary="用户正在维护 LUMORA。",
            tool_definitions=(
                {
                    "type": "function",
                    "function": {
                        "name": "file_read",
                        "parameters": {"type": "object"},
                    },
                },
            ),
        )
    )

    body = provider._request_body(
        ModelConnectionSettings(
            provider_name="OpenAI compatible",
            base_url="https://example.com/v1",
            model="example-model",
            api_key="secret",
        ),
        prompt,
        [ChatMessageRequest(role="user", content="读取文件")],
        stream=False,
    )

    assert body["messages"][-2]["role"] == "user"
    assert body["messages"][-2]["content"].startswith("以下是系统生成的历史记忆摘要")
    assert body["messages"][-1] == {"role": "user", "content": "读取文件"}
    assert body["tools"][0]["function"]["name"] == "file_read"


def test_reasoning_strength_uses_nested_reasoning_format() -> None:
    provider = OpenAICompatibleProvider()
    body = provider._request_body(
        ModelConnectionSettings(
            provider_name="DeepSeek",
            base_url="https://api.deepseek.com",
            model="deepseek-v4-pro",
            api_key="secret",
        ),
        PromptBuilder().build(),
        [ChatMessageRequest(role="user", content="你好")],
        stream=True,
        reasoning_effort="none",
    )

    assert body["reasoning"] == {"effort": "none"}
    assert "reasoning_effort" not in body
    assert "thinking" not in body
    assert isinstance(body["messages"][-1]["content"], str)
    assert body["messages"][-1]["content"] == "你好"


def test_model_max_output_tokens_are_sent_as_max_tokens() -> None:
    provider = OpenAICompatibleProvider()
    body = provider._request_body(
        ModelConnectionSettings(
            provider_name="DeepSeek",
            base_url="https://api.deepseek.com",
            model="deepseek-chat",
            api_key="secret",
            max_output_tokens=32_768,
        ),
        PromptBuilder().build(),
        [ChatMessageRequest(role="user", content="你好")],
        stream=False,
    )

    assert body["max_tokens"] == 32_768


def test_agent_turn_completion_honors_max_output_tokens(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.provider.openai_compatible_provider.httpx.AsyncClient",
        _CompletionClient,
    )

    asyncio.run(
        OpenAICompatibleProvider().complete_agent_turn(
            ModelConnectionSettings(
                provider_name="OpenAI compatible",
                base_url="https://example.com/v1",
                model="example-model",
                api_key="secret",
                max_output_tokens=512,
            ),
            [{"role": "user", "content": "review"}],
            (),
            None,
        )
    )

    assert _CompletionClient.body["max_tokens"] == 512


def test_agent_turn_stream_stops_at_done_marker(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.provider.openai_compatible_provider.httpx.AsyncClient",
        _StreamingClient,
    )
    provider = OpenAICompatibleProvider()

    async def collect():
        return [
            event
            async for event in provider.stream_agent_turn(
                ModelConnectionSettings(
                    provider_name="OpenAI compatible",
                    base_url="https://example.com/v1",
                    model="example-model",
                    api_key="secret",
                ),
                [{"role": "user", "content": "继续"}],
                (),
                None,
            )
        ]

    events = asyncio.run(collect())

    assert [event.type for event in events] == ["content_delta", "completed"]
    assert events[-1].turn is not None
    assert events[-1].turn.content == "完成"
    assert events[-1].turn.usage.total_tokens == 6
