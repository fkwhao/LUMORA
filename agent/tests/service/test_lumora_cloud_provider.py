import asyncio
import json

import httpx

from app.model.model_connection_settings import ModelConnectionSettings
from app.provider.lumora_cloud_provider import LumoraCloudProvider


def settings() -> ModelConnectionSettings:
    return ModelConnectionSettings(
        provider_name="LUMORA Cloud",
        base_url="http://127.0.0.1:4567",
        api_key="local-token",
        model="lumora-test",
        max_output_tokens=2048,
        context_window=128_000,
        api_format="lumora-cloud",
    )


def test_complete_uses_internal_protocol_without_provider_format() -> None:
    asyncio.run(_assert_complete_uses_internal_protocol_without_provider_format())


async def _assert_complete_uses_internal_protocol_without_provider_format() -> None:
    captured: dict[str, object] = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        captured["path"] = request.url.path
        captured["authorization"] = request.headers.get("Authorization")
        captured["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "protocolVersion": "1",
                "model": "lumora-test",
                "result": {
                    "content": "done",
                    "reasoning": "thought",
                    "model": "lumora-test",
                    "toolCalls": [
                        {
                            "id": "call-1",
                            "name": "read_file",
                            "arguments": "{\"path\":\"a.txt\"}",
                        }
                    ],
                },
                "usage": {
                    "promptTokens": 10,
                    "completionTokens": 3,
                    "totalTokens": 13,
                    "inputTokens": 10,
                    "outputTokens": 2,
                    "reasoningTokens": 1,
                    "cacheReadTokens": 0,
                    "cacheWriteTokens": 0,
                    "cacheMetricsAvailable": False,
                },
            },
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = LumoraCloudProvider(http_client=client)
    turn = await provider.complete_agent_turn(
        settings(),
        [{"role": "user", "content": "hello"}],
        ({
            "type": "function",
            "function": {
                "name": "read_file",
                "description": "Read",
                "parameters": {"type": "object"},
            },
        },),
        "medium",
    )
    await client.aclose()

    assert captured["path"] == "/invoke"
    assert captured["authorization"] == "Bearer local-token"
    body = captured["body"]
    assert isinstance(body, dict)
    assert body["protocolVersion"] == "1"
    assert body["generation"] == {
        "maxOutputTokens": 2048,
        "reasoningEffort": "medium",
    }
    assert body["features"] == {"webSearch": False}
    assert "protocolType" not in body
    assert turn.content == "done"
    assert turn.reasoning == "thought"
    assert turn.tool_calls[0].name == "read_file"
    assert turn.usage.reasoning_tokens == 1


def test_stream_parses_lumora_events() -> None:
    asyncio.run(_assert_stream_parses_lumora_events())


async def _assert_stream_parses_lumora_events() -> None:
    body = "\n".join([
        'data: {"protocolVersion":"1","type":"content_delta","resolvedModel":"lumora-test","delta":"hello"}',
        "",
        'data: {"protocolVersion":"1","type":"reasoning_delta","resolvedModel":"lumora-test","delta":"why"}',
        "",
        'data: {"protocolVersion":"1","type":"web_search_started","resolvedModel":"lumora-test","itemId":"search-1","query":"LUMORA"}',
        "",
        'data: {"protocolVersion":"1","type":"web_search_progress","resolvedModel":"lumora-test","itemId":"search-1","query":"LUMORA","delta":"正在检索网页…"}',
        "",
        'data: {"protocolVersion":"1","type":"web_search_completed","resolvedModel":"lumora-test","itemId":"search-1","query":"LUMORA","sources":[{"title":"LUMORA","url":"https://example.com/lumora"}]}',
        "",
        'data: {"protocolVersion":"1","type":"completed","resolvedModel":"lumora-test","result":{"content":"hello","reasoning":"why","model":"lumora-test","toolCalls":[]},"usage":{"promptTokens":4,"completionTokens":2,"totalTokens":6,"inputTokens":4,"outputTokens":1,"reasoningTokens":1,"cacheReadTokens":0,"cacheWriteTokens":0,"cacheMetricsAvailable":false}}',
        "",
        "data: [DONE]",
        "",
    ])

    async def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=body, headers={"Content-Type": "text/event-stream"})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = LumoraCloudProvider(http_client=client)
    events = [
        event
        async for event in provider.stream_agent_turn(
            settings(), [{"role": "user", "content": "hello"}], (), None
        )
    ]
    await client.aclose()

    assert [event.type for event in events] == [
        "content_delta",
        "reasoning_delta",
        "web_search_started",
        "web_search_progress",
        "web_search_completed",
        "completed",
    ]
    assert events[4].sources[0].url == "https://example.com/lumora"
    assert events[-1].turn is not None
    assert events[-1].turn.content == "hello"
    assert events[-1].turn.usage.total_tokens == 6
