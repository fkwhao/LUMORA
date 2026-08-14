import asyncio
import json

import httpx

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


class _InterruptedStreamingResponse(_StreamingResponse):
    async def aiter_lines(self):
        yield "data: " + json.dumps({
            "model": "example-model",
            "choices": [{"delta": {"content": "x" * 160}}],
        })
        raise httpx.RemoteProtocolError("incomplete chunked read")


class _InterruptedStreamingClient(_StreamingClient):
    def stream(self, *_args, **_kwargs):
        return _InterruptedStreamingResponse()


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

    assert [event.type for event in events] == [
        "usage",
        "content_delta",
        "usage",
        "completed",
    ]
    usage_events = [event for event in events if event.type == "usage"]
    assert usage_events[0].usage_estimated is True
    assert usage_events[-1].usage_estimated is False
    assert usage_events[-1].usage is not None
    assert usage_events[-1].usage.total_tokens == 6
    assert events[-1].turn is not None
    assert events[-1].turn.content == "完成"
    assert events[-1].turn.usage.total_tokens == 6


def test_agent_turn_stream_estimates_usage_before_disconnect(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.provider.openai_compatible_provider.httpx.AsyncClient",
        _InterruptedStreamingClient,
    )
    captured = []

    async def collect() -> None:
        try:
            async for event in OpenAICompatibleProvider().stream_agent_turn(
                ModelConnectionSettings(
                    provider_name="OpenAI compatible",
                    base_url="https://example.com/v1",
                    model="example-model",
                    api_key="secret",
                ),
                [{"role": "user", "content": "继续"}],
                (),
                None,
            ):
                captured.append(event)
        except httpx.RemoteProtocolError:
            pass

    asyncio.run(collect())
    usage_events = [event for event in captured if event.type == "usage"]

    assert len(usage_events) == 2
    assert usage_events[0].usage is not None
    assert usage_events[0].usage.prompt_tokens > 0
    assert usage_events[0].usage.completion_tokens == 0
    assert usage_events[1].usage is not None
    assert usage_events[1].usage.completion_tokens == 40
    assert usage_events[1].usage_estimated is True
