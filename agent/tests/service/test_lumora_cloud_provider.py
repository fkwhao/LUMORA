import asyncio
import json
from dataclasses import replace

import httpx

from app.context.estimator import TokenEstimator
from app.dto.request.chat_completion_request import ChatMessageRequest
from app.model.model_connection_settings import ModelConnectionSettings
from app.prompt.prompt_assembly import PromptAssembly
from app.prompt.prompt_segment import (
    PromptCachePolicy,
    PromptPriority,
    PromptSegment,
    PromptTarget,
    PromptTrustLevel,
)
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


def memory_prompt() -> PromptAssembly:
    return PromptAssembly(
        (
            PromptSegment(
                key="memory.extraction",
                target=PromptTarget.SYSTEM,
                content="Return memory candidates as JSON.",
                trust_level=PromptTrustLevel.TRUSTED,
                priority=PromptPriority.REQUIRED,
                cache_policy=PromptCachePolicy.STATIC,
            ),
        )
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


def test_memory_completion_repairs_invalid_cloud_json_once() -> None:
    asyncio.run(_assert_memory_completion_repairs_invalid_cloud_json_once())


async def _assert_memory_completion_repairs_invalid_cloud_json_once() -> None:
    captured: list[dict[str, object]] = []
    responses = [
        {
            "protocolVersion": "1",
            "model": "lumora-test",
            "result": {
                "content": "not-json",
                "reasoning": "",
                "model": "lumora-test",
                "toolCalls": [],
            },
            "usage": {
                "promptTokens": 10,
                "completionTokens": 2,
                "totalTokens": 12,
            },
        },
        {
            "protocolVersion": "1",
            "model": "lumora-test",
            "result": {
                "content": '```json\n{"candidates": []}\n```',
                "reasoning": "",
                "model": "lumora-test",
                "toolCalls": [],
            },
            "usage": {
                "promptTokens": 5,
                "completionTokens": 1,
                "totalTokens": 6,
            },
        },
    ]

    async def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        assert isinstance(body, dict)
        captured.append(body)
        return httpx.Response(200, json=responses.pop(0))

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = LumoraCloudProvider(http_client=client)
    completion = await provider.complete(
        replace(settings(), web_search_enabled=True),
        memory_prompt(),
        [ChatMessageRequest(role="user", content='{"turn":"remember me"}')],
    )
    await client.aclose()

    assert completion.message == '{"candidates":[]}'
    assert completion.usage.prompt_tokens == 15
    assert completion.usage.completion_tokens == 3
    assert completion.usage.total_tokens == 18
    assert len(captured) == 2
    for body in captured:
        assert body["features"] == {"webSearch": False}
        generation = body["generation"]
        assert isinstance(generation, dict)
        schema = generation["responseSchema"]
        assert isinstance(schema, dict)
        assert schema["required"] == ["candidates"]
        assert schema["properties"]["candidates"]["maxItems"] == 8
    retry_messages = captured[1]["messages"]
    assert isinstance(retry_messages, list)
    assert retry_messages[-2]["role"] == "assistant"
    assert retry_messages[-1]["role"] == "user"


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


def test_stream_normalizes_only_web_search_active_context() -> None:
    asyncio.run(_assert_stream_normalizes_only_web_search_active_context())


async def _assert_stream_normalizes_only_web_search_active_context() -> None:
    raw_usage = {
        "promptTokens": 32_000,
        "completionTokens": 100,
        "totalTokens": 32_100,
        "inputTokens": 12_000,
        "outputTokens": 100,
        "reasoningTokens": 0,
        "cacheReadTokens": 20_000,
        "cacheWriteTokens": 0,
        "cacheMetricsAvailable": True,
    }
    provider_state = {
        "protocol": "ANTHROPIC",
        "modelCode": "lumora-test",
        "providerCode": "managed-provider",
        "content": [
            {"type": "server_tool_use", "id": "search-1", "name": "web_search"},
            {"type": "web_search_tool_result", "tool_use_id": "search-1", "content": []},
        ],
    }
    body = "\n".join([
        "data: " + json.dumps({
            "protocolVersion": "1",
            "type": "usage",
            "resolvedModel": "lumora-test",
            "usage": raw_usage,
        }),
        "",
        'data: {"protocolVersion":"1","type":"web_search_started","resolvedModel":"lumora-test","itemId":"search-1","query":"LUMORA"}',
        "",
        "data: " + json.dumps({
            "protocolVersion": "1",
            "type": "completed",
            "resolvedModel": "lumora-test",
            "result": {
                "content": "done",
                "reasoning": "",
                "model": "lumora-test",
                "toolCalls": [],
                "providerState": provider_state,
            },
            "usage": raw_usage,
        }),
        "",
        "data: [DONE]",
        "",
    ])

    async def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=body, headers={"Content-Type": "text/event-stream"})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = LumoraCloudProvider(http_client=client)
    cloud_settings = replace(settings(), web_search_enabled=True)
    messages = [
        {
            "role": "assistant",
            "content": "previous answer",
            "provider_state": {"opaque": "x" * 80_000},
        },
        {"role": "user", "content": "搜索 LUMORA"},
    ]
    events = [
        event
        async for event in provider.stream_agent_turn(
            cloud_settings, messages, (), None
        )
    ]
    await client.aclose()

    assert [event.type for event in events] == [
        "web_search_started",
        "completed",
    ]
    completed = events[-1].turn
    assert completed is not None
    expected_prompt = TokenEstimator().estimate_messages([
        {"role": "assistant", "content": "previous answer"},
        {"role": "user", "content": "搜索 LUMORA"},
    ]) + TokenEstimator().estimate_tools(())
    assert completed.usage.prompt_tokens == expected_prompt
    assert completed.usage.total_tokens == raw_usage["totalTokens"]
    assert completed.usage.input_tokens == raw_usage["inputTokens"]
    assert completed.usage.cache_read_tokens == raw_usage["cacheReadTokens"]


def test_stream_uses_buffered_usage_when_completed_event_omits_it() -> None:
    asyncio.run(_assert_stream_uses_buffered_usage_when_completed_event_omits_it())


async def _assert_stream_uses_buffered_usage_when_completed_event_omits_it() -> None:
    raw_usage = {
        "promptTokens": 12,
        "completionTokens": 3,
        "totalTokens": 15,
        "inputTokens": 12,
        "outputTokens": 3,
        "reasoningTokens": 0,
        "cacheReadTokens": 0,
        "cacheWriteTokens": 0,
        "cacheMetricsAvailable": False,
    }
    body = "\n".join(
        [
            "data: "
            + json.dumps(
                {
                    "protocolVersion": "1",
                    "type": "usage",
                    "resolvedModel": "lumora-test",
                    "usage": raw_usage,
                }
            ),
            "",
            'data: {"protocolVersion":"1","type":"completed","resolvedModel":"lumora-test","result":{"content":"done","reasoning":"","model":"lumora-test","toolCalls":[]}}',
            "",
            "data: [DONE]",
            "",
        ]
    )

    async def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            text=body,
            headers={"Content-Type": "text/event-stream"},
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = LumoraCloudProvider(http_client=client)
    events = [
        event
        async for event in provider.stream_agent_turn(
            settings(), [{"role": "user", "content": "hello"}], (), None
        )
    ]
    await client.aclose()

    assert [event.type for event in events] == ["completed"]
    assert events[0].turn is not None
    assert events[0].turn.usage.total_tokens == 15


def test_stream_keeps_cloud_prompt_usage_without_actual_web_search() -> None:
    asyncio.run(_assert_stream_keeps_cloud_prompt_usage_without_actual_web_search())


async def _assert_stream_keeps_cloud_prompt_usage_without_actual_web_search() -> None:
    body = (
        'data: {"protocolVersion":"1","type":"completed",'
        '"resolvedModel":"lumora-test","result":{"content":"done",'
        '"reasoning":"","model":"lumora-test","toolCalls":[]},'
        '"usage":{"promptTokens":32000,"completionTokens":1,'
        '"totalTokens":32001,"inputTokens":32000,"outputTokens":1,'
        '"reasoningTokens":0,"cacheReadTokens":0,"cacheWriteTokens":0,'
        '"cacheMetricsAvailable":false}}\n\ndata: [DONE]\n\n'
    )

    async def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=body, headers={"Content-Type": "text/event-stream"})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = LumoraCloudProvider(http_client=client)
    events = [
        event
        async for event in provider.stream_agent_turn(
            replace(settings(), web_search_enabled=True),
            [{"role": "user", "content": "普通问题"}],
            (),
            None,
        )
    ]
    await client.aclose()

    assert events[-1].turn is not None
    assert events[-1].turn.usage.prompt_tokens == 32_000
    assert events[-1].turn.provider_state is not None
    assert (
        events[-1].turn.provider_state["_lumoraCloudContext"]["activeTokens"]
        == 32_000
    )


def test_web_search_reuses_persisted_cloud_context_anchor() -> None:
    asyncio.run(_assert_web_search_reuses_persisted_cloud_context_anchor())


async def _assert_web_search_reuses_persisted_cloud_context_anchor() -> None:
    responses = [
        {
            "protocolVersion": "1",
            "model": "lumora-test",
            "result": {
                "content": "ordinary answer",
                "reasoning": "",
                "model": "lumora-test",
                "toolCalls": [],
                "providerState": {
                    "protocol": "ANTHROPIC",
                    "modelCode": "lumora-test",
                    "providerCode": "managed-provider",
                    "content": [{"type": "thinking", "thinking": "x" * 80_000}],
                },
            },
            "usage": {
                "promptTokens": 15_000,
                "completionTokens": 20,
                "totalTokens": 15_020,
                "inputTokens": 3_000,
                "outputTokens": 20,
                "reasoningTokens": 0,
                "cacheReadTokens": 12_000,
                "cacheWriteTokens": 0,
                "cacheMetricsAvailable": True,
            },
        },
        {
            "protocolVersion": "1",
            "model": "lumora-test",
            "result": {
                "content": "search answer",
                "reasoning": "",
                "model": "lumora-test",
                "toolCalls": [],
                "providerState": {
                    "protocol": "ANTHROPIC",
                    "modelCode": "lumora-test",
                    "providerCode": "managed-provider",
                    "content": [
                        {
                            "type": "server_tool_use",
                            "id": "search-1",
                            "name": "web_search",
                        },
                        {
                            "type": "web_search_tool_result",
                            "tool_use_id": "search-1",
                            "content": [],
                        },
                    ],
                },
            },
            "usage": {
                "promptTokens": 60_000,
                "completionTokens": 100,
                "totalTokens": 60_100,
                "inputTokens": 20_000,
                "outputTokens": 100,
                "reasoningTokens": 0,
                "cacheReadTokens": 40_000,
                "cacheWriteTokens": 0,
                "cacheMetricsAvailable": True,
            },
        },
    ]

    async def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=responses.pop(0))

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = LumoraCloudProvider(http_client=client)
    cloud_settings = replace(settings(), web_search_enabled=True)
    base_messages = [
        {"role": "system", "content": "You are an agent."},
        {"role": "user", "content": "First question"},
    ]
    huge_tools = ({
        "type": "function",
        "function": {
            "name": "large_tool",
            "description": "large schema " * 20_000,
            "parameters": {"type": "object"},
        },
    },)
    ordinary = await provider.complete_agent_turn(
        cloud_settings,
        base_messages,
        huge_tools,
        None,
    )
    assert ordinary.provider_state is not None

    next_messages = [
        *base_messages,
        {
            "role": "assistant",
            "content": ordinary.content,
            "provider_state": ordinary.provider_state,
        },
        {"role": "user", "content": "Search this now"},
    ]
    searched = await provider.complete_agent_turn(
        cloud_settings,
        next_messages,
        huge_tools,
        None,
    )
    await client.aclose()

    expected_prompt = 15_000 + TokenEstimator().estimate_messages([
        {"role": "assistant", "content": ordinary.content},
        {"role": "user", "content": "Search this now"},
    ])
    assert searched.usage.prompt_tokens == expected_prompt
    assert searched.usage.total_tokens == 60_100
    assert searched.usage.input_tokens == 20_000
    assert searched.usage.cache_read_tokens == 40_000
    assert searched.provider_state is not None
    assert (
        searched.provider_state["_lumoraCloudContext"]["activeTokens"]
        == expected_prompt
    )
