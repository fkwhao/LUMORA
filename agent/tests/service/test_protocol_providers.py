import asyncio
import json
from dataclasses import replace
from typing import Any, ClassVar

import httpx
import pytest

from app.dto.response.chat_completion_response import TokenUsageResponse
from app.harness.contracts import ProviderTurn
from app.model.model_connection_settings import ModelConnectionSettings
from app.provider.anthropic_provider import AnthropicProvider, _anthropic_messages
from app.provider.anthropic_provider import _parse_turn as parse_anthropic_turn
from app.provider.anthropic_provider import _request_body as anthropic_request_body
from app.provider.hosted_web_search import responses_web_searches
from app.provider.responses_provider import ResponsesProvider
from app.provider.responses_provider import _parse_turn as parse_responses_turn
from app.provider.responses_provider import _request_body as responses_request_body
from app.provider.routing_provider import RoutingModelProvider


def _settings(api_format: str) -> ModelConnectionSettings:
    return ModelConnectionSettings(
        provider_name="Example",
        base_url="https://example.com/v1",
        api_key="secret",
        model="example-model",
        api_format=api_format,
    )


def test_responses_adapter_flattens_tools_and_tool_results() -> None:
    body = responses_request_body(
        _settings("responses"),
        [
            {
                "role": "assistant",
                "content": "",
                "tool_calls": [{
                    "id": "call-1",
                    "function": {"name": "file_read", "arguments": '{"path":"a"}'},
                }],
            },
            {"role": "tool", "tool_call_id": "call-1", "content": "ok"},
        ],
        ({
            "type": "function",
            "function": {
                "name": "file_read",
                "description": "read",
                "parameters": {"type": "object"},
            },
        },),
        None,
        stream=False,
    )

    assert body["tools"] == [{
        "type": "function",
        "name": "file_read",
        "description": "read",
        "parameters": {"type": "object"},
    }]
    assert body["input"][-1] == {
        "type": "function_call_output",
        "call_id": "call-1",
        "output": "ok",
    }


def test_responses_adapter_parses_function_calls() -> None:
    turn = parse_responses_turn(
        {
            "model": "gpt-example",
            "output": [
                {
                    "type": "message",
                    "content": [{"type": "output_text", "text": "done"}],
                },
                {
                    "type": "function_call",
                    "call_id": "call-1",
                    "name": "file_read",
                    "arguments": '{"path":"a"}',
                },
            ],
            "usage": {"input_tokens": 3, "output_tokens": 2, "total_tokens": 5},
        },
        "fallback",
    )

    assert turn.content == "done"
    assert turn.tool_calls[0].name == "file_read"
    assert turn.usage.total_tokens == 5


def test_responses_adapter_keeps_only_final_message_after_hosted_search() -> None:
    turn = parse_responses_turn(
        {
            "model": "gpt-example",
            "output": [
                {
                    "type": "message",
                    "content": [{
                        "type": "output_text",
                        "text": "让我继续核实官方页面。",
                    }],
                },
                {
                    "type": "web_search_call",
                    "id": "search-1",
                    "status": "completed",
                    "action": {"type": "search", "query": "official docs"},
                },
                {
                    "type": "message",
                    "content": [{
                        "type": "output_text",
                        "text": "最终核实结果。",
                    }],
                },
            ],
        },
        "fallback",
    )

    assert turn.content == "最终核实结果。"


def test_responses_adapter_enables_hosted_web_search_and_parses_sources() -> None:
    settings = replace(_settings("responses"), web_search_enabled=True)
    body = responses_request_body(settings, [], (), None, stream=True)

    assert body["tools"] == [{"type": "web_search"}]
    assert body["tool_choice"] == "auto"
    assert body["include"] == ["web_search_call.action.sources"]

    searches = responses_web_searches({
        "output": [{
            "type": "web_search_call",
            "id": "search-1",
            "action": {
                "type": "search",
                "query": "latest model docs",
                "sources": [
                    {"title": "Documentation", "url": "https://example.com/docs"},
                    {"title": "Duplicate", "url": "https://example.com/docs"},
                ],
            },
        }],
    })

    assert searches[0].query == "latest model docs"
    assert searches[0].sources[0].title == "Documentation"
    assert len(searches[0].sources) == 1

    page_actions = responses_web_searches({
        "output": [
            {
                "type": "web_search_call",
                "id": "open-1",
                "action": {
                    "type": "open_page",
                    "url": "https://example.com/docs",
                },
            },
            {
                "type": "web_search_call",
                "id": "find-1",
                "action": {
                    "type": "find_in_page",
                    "url": "https://example.com/docs",
                    "pattern": "desktop app",
                },
            },
        ]
    })

    assert page_actions[0].query == "https://example.com/docs"
    assert page_actions[1].query == (
        "https://example.com/docs · desktop app"
    )


class _ResponsesStreamingResponse:
    events: ClassVar[list[dict[str, Any]]] = []
    is_error = False
    status_code = 200
    encoding = "utf-8"

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    def raise_for_status(self) -> None:
        return None

    async def aiter_lines(self):
        for event in self.events:
            yield "data: " + json.dumps(event, ensure_ascii=False)


class _ResponsesStreamingClient:
    def __init__(self, *_args, **_kwargs) -> None:
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    def stream(self, *_args, **_kwargs):
        return _ResponsesStreamingResponse()


class _ResponsesInterruptedResponse(_ResponsesStreamingResponse):
    async def aiter_lines(self):
        yield "data: " + json.dumps({
            "type": "response.created",
            "response": {"model": "gpt-example"},
        })
        yield "data: " + json.dumps({
            "type": "response.output_text.delta",
            "item_id": "message-partial",
            "delta": "x" * 160,
        })
        raise httpx.RemoteProtocolError("incomplete chunked read")


class _ResponsesInterruptedClient(_ResponsesStreamingClient):
    def stream(self, *_args, **_kwargs):
        return _ResponsesInterruptedResponse()


class _ResponsesFallbackResponse:
    def __init__(
        self,
        status_code: int,
        body: str = "",
        events: list[dict[str, Any]] | None = None,
    ) -> None:
        self.status_code = status_code
        self.is_error = status_code >= 400
        self.encoding = "utf-8"
        self._body = body
        self._events = events or []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def aread(self) -> bytes:
        return self._body.encode()

    def raise_for_status(self) -> None:
        if self.is_error:
            request = httpx.Request("POST", "https://example.com/v1/responses")
            response = httpx.Response(self.status_code, request=request)
            raise httpx.HTTPStatusError(
                "Responses request failed",
                request=request,
                response=response,
            )

    async def aiter_lines(self):
        for event in self._events:
            yield "data: " + json.dumps(event, ensure_ascii=False)


class _ResponsesFallbackClient:
    bodies: ClassVar[list[dict[str, Any]]] = []

    def __init__(self, *_args, **_kwargs) -> None:
        self._response_index = 0

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    def stream(self, *_args, **kwargs):
        self.bodies.append(kwargs["json"])
        if self._response_index == 0:
            response = _ResponsesFallbackResponse(
                400,
                '{"error":{"message":"Unknown parameter: include"}}',
            )
        else:
            response = _ResponsesFallbackResponse(
                200,
                events=[
                    {
                        "type": "response.output_text.delta",
                        "item_id": "message-final",
                        "delta": "降级后正常回答。",
                    },
                    {
                        "type": "response.completed",
                        "response": {
                            "model": "gpt-example",
                            "output": [_response_message(
                                "message-final",
                                "降级后正常回答。",
                            )],
                        },
                    },
                ],
            )
        self._response_index += 1
        return response


def _response_message(item_id: str, text: str) -> dict[str, Any]:
    return {
        "type": "message",
        "id": item_id,
        "content": [{"type": "output_text", "text": text}],
    }


def _response_search(item_id: str, query: str) -> dict[str, Any]:
    return {
        "type": "web_search_call",
        "id": item_id,
        "status": "completed",
        "action": {
            "type": "search",
            "query": query,
            "sources": [{
                "title": "Official docs",
                "url": "https://example.com/docs",
            }],
        },
    }


def test_responses_streams_final_answer_after_hosted_search(monkeypatch) -> None:
    search = _response_search("search-1", "official docs")
    final = _response_message("message-final", "最终核实结果。")
    _ResponsesStreamingResponse.events = [
        {
            "type": "response.web_search_call.in_progress",
            "item_id": "search-1",
        },
        {
            "type": "response.output_item.done",
            "item": search,
        },
        {
            "type": "response.output_item.added",
            "output_index": 1,
            "item": {"type": "message", "id": "message-final"},
        },
        {
            "type": "response.output_text.delta",
            "item_id": "message-final",
            "output_index": 1,
            "delta": "最终核实",
        },
        {
            "type": "response.output_text.delta",
            "item_id": "message-final",
            "output_index": 1,
            "delta": "结果。",
        },
        {
            "type": "response.completed",
            "response": {
                "model": "gpt-example",
                "output": [search, final],
                "usage": {
                    "input_tokens": 4,
                    "output_tokens": 3,
                    "total_tokens": 7,
                },
            },
        },
    ]
    monkeypatch.setattr(
        "app.provider.responses_provider.httpx.AsyncClient",
        _ResponsesStreamingClient,
    )
    settings = replace(_settings("responses"), web_search_enabled=True)

    async def collect():
        return [
            event
            async for event in ResponsesProvider().stream_agent_turn(
                settings,
                [{"role": "user", "content": "查询官方文档"}],
                (),
                None,
            )
        ]

    events = asyncio.run(collect())

    assert [event.delta for event in events if event.type == "content_delta"] == [
        "最终核实",
        "结果。",
    ]
    assert all(event.type != "content_reset" for event in events)
    assert events[-1].turn is not None
    assert events[-1].turn.content == "最终核实结果。"
    usage_events = [event for event in events if event.type == "usage"]
    assert usage_events[0].usage_estimated is True
    assert usage_events[-1].usage_estimated is False
    assert usage_events[-1].usage is not None
    assert usage_events[-1].usage.total_tokens == 7


def test_responses_stream_estimates_usage_before_disconnect(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.provider.responses_provider.httpx.AsyncClient",
        _ResponsesInterruptedClient,
    )
    captured = []

    async def collect() -> None:
        try:
            async for event in ResponsesProvider().stream_agent_turn(
                _settings("responses"),
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


def test_responses_accepts_incomplete_event_with_partial_answer(monkeypatch) -> None:
    _ResponsesStreamingResponse.events = [
        {
            "type": "response.output_text.delta",
            "item_id": "message-partial",
            "delta": "这是达到输出上限前的有效内容。",
        },
        {
            "type": "response.incomplete",
            "response": {
                "model": "gpt-example",
                "status": "incomplete",
                "incomplete_details": {"reason": "max_output_tokens"},
                "output": [_response_message(
                    "message-partial",
                    "这是达到输出上限前的有效内容。",
                )],
            },
        },
    ]
    monkeypatch.setattr(
        "app.provider.responses_provider.httpx.AsyncClient",
        _ResponsesStreamingClient,
    )

    async def collect():
        return [
            event
            async for event in ResponsesProvider().stream_agent_turn(
                _settings("responses"),
                [{"role": "user", "content": "输出较长内容"}],
                (),
                None,
            )
        ]

    events = asyncio.run(collect())

    assert events[-1].type == "completed"
    assert events[-1].turn is not None
    assert events[-1].turn.content == "这是达到输出上限前的有效内容。"


def test_responses_streams_refusal_as_visible_content(monkeypatch) -> None:
    _ResponsesStreamingResponse.events = [
        {
            "type": "response.refusal.delta",
            "item_id": "message-refusal",
            "delta": "无法协助该请求。",
        },
        {
            "type": "response.completed",
            "response": {
                "model": "gpt-example",
                "output": [{
                    "type": "message",
                    "id": "message-refusal",
                    "content": [{
                        "type": "refusal",
                        "refusal": "无法协助该请求。",
                    }],
                }],
            },
        },
    ]
    monkeypatch.setattr(
        "app.provider.responses_provider.httpx.AsyncClient",
        _ResponsesStreamingClient,
    )

    async def collect():
        return [
            event
            async for event in ResponsesProvider().stream_agent_turn(
                _settings("responses"),
                [{"role": "user", "content": "请求"}],
                (),
                None,
            )
        ]

    events = asyncio.run(collect())

    assert [event.delta for event in events if event.type == "content_delta"] == [
        "无法协助该请求。"
    ]
    assert events[-1].turn is not None
    assert events[-1].turn.content == "无法协助该请求。"


def test_responses_retries_without_unsupported_include(monkeypatch) -> None:
    _ResponsesFallbackClient.bodies = []
    monkeypatch.setattr(
        "app.provider.responses_provider.httpx.AsyncClient",
        _ResponsesFallbackClient,
    )
    settings = replace(_settings("responses"), web_search_enabled=True)

    async def collect():
        return [
            event
            async for event in ResponsesProvider().stream_agent_turn(
                settings,
                [{"role": "user", "content": "查询资料"}],
                (),
                None,
            )
        ]

    events = asyncio.run(collect())

    assert len(_ResponsesFallbackClient.bodies) == 2
    assert "include" in _ResponsesFallbackClient.bodies[0]
    assert "include" not in _ResponsesFallbackClient.bodies[1]
    assert events[-1].turn is not None
    assert events[-1].turn.content == "降级后正常回答。"


def test_responses_preserves_stage_message_before_another_search(
    monkeypatch,
) -> None:
    first_search = _response_search("search-1", "first query")
    second_search = _response_search("search-2", "second query")
    stage = _response_message("message-stage", "我再核实一下官方页面。")
    final = _response_message("message-final", "这是最终答案。")
    _ResponsesStreamingResponse.events = [
        {"type": "response.output_item.done", "item": first_search},
        {
            "type": "response.output_item.added",
            "item": {"type": "message", "id": "message-stage"},
        },
        {
            "type": "response.output_text.delta",
            "item_id": "message-stage",
            "delta": "我再核实一下官方页面。",
        },
        {
            "type": "response.output_item.added",
            "item": {"type": "web_search_call", "id": "search-2"},
        },
        {"type": "response.output_item.done", "item": second_search},
        {
            "type": "response.output_item.added",
            "item": {"type": "message", "id": "message-final"},
        },
        {
            "type": "response.output_text.delta",
            "item_id": "message-final",
            "delta": "这是最终",
        },
        {
            "type": "response.output_text.delta",
            "item_id": "message-final",
            "delta": "答案。",
        },
        {
            "type": "response.completed",
            "response": {
                "model": "gpt-example",
                "output": [first_search, stage, second_search, final],
            },
        },
    ]
    monkeypatch.setattr(
        "app.provider.responses_provider.httpx.AsyncClient",
        _ResponsesStreamingClient,
    )
    settings = replace(_settings("responses"), web_search_enabled=True)

    async def collect():
        return [
            event
            async for event in ResponsesProvider().stream_agent_turn(
                settings,
                [{"role": "user", "content": "继续查询"}],
                (),
                None,
            )
        ]

    events = asyncio.run(collect())
    stage_event = next(event for event in events if event.type == "stage_content")

    assert stage_event.delta == "我再核实一下官方页面。"
    assert stage_event.item_id == "message-stage"
    assert [event.delta for event in events if event.type == "content_delta"] == [
        "我再核实一下官方页面。",
        "这是最终",
        "答案。",
    ]
    assert events[-1].turn is not None
    assert events[-1].turn.content == "这是最终答案。"


def test_anthropic_adapter_moves_system_and_groups_tool_results() -> None:
    system, messages = _anthropic_messages([
        {"role": "system", "content": "policy"},
        {
            "role": "assistant",
            "content": "",
            "tool_calls": [{
                "id": "tool-1",
                "function": {"name": "file_read", "arguments": '{"path":"a"}'},
            }],
        },
        {"role": "tool", "tool_call_id": "tool-1", "content": "ok"},
    ])

    assert system == "policy"
    assert messages[0]["content"][0]["type"] == "tool_use"
    assert messages[1] == {
        "role": "user",
        "content": [{
            "type": "tool_result",
            "tool_use_id": "tool-1",
            "content": "ok",
        }],
    }


def test_anthropic_adapter_replays_native_tool_turn_with_thinking_signature() -> None:
    native_content = [
        {
            "type": "thinking",
            "thinking": "I should inspect the file.",
            "signature": "signed-thinking",
        },
        {"type": "text", "text": "I will inspect it."},
        {
            "type": "tool_use",
            "id": "tool-1",
            "name": "file_read",
            "input": {"path": "a"},
        },
    ]

    _system, messages = _anthropic_messages([
        {"role": "user", "content": "inspect"},
        {
            "role": "assistant",
            "content": "I will inspect it.",
            "tool_calls": [{
                "id": "tool-1",
                "function": {"name": "file_read", "arguments": '{"path":"a"}'},
            }],
            "provider_state": {
                "apiFormat": "anthropic",
                "contentBlocks": native_content,
            },
        },
        {"role": "tool", "tool_call_id": "tool-1", "content": "ok"},
    ])

    assert messages[1] == {"role": "assistant", "content": native_content}
    assert messages[2]["content"][0]["tool_use_id"] == "tool-1"


def test_anthropic_adapter_migrates_completed_legacy_tool_turn() -> None:
    body = anthropic_request_body(
        _settings("anthropic"),
        [
            {"role": "user", "content": "inspect"},
            {
                "role": "assistant",
                "content": "I inspected it.",
                "tool_calls": [{
                    "id": "tool-1",
                    "function": {
                        "name": "file_read",
                        "arguments": '{"path":"a"}',
                    },
                }],
            },
            {"role": "tool", "tool_call_id": "tool-1", "content": "ok"},
        ],
        (),
        None,
        stream=True,
    )

    assert body["messages"][-1]["role"] == "user"
    migrated = body["messages"][-1]["content"][0]["text"]
    assert "兼容迁移" in migrated
    assert '"callId":"tool-1"' in migrated
    assert not any(
        block.get("type") in {"tool_use", "tool_result"}
        for message in body["messages"]
        for block in message["content"]
    )


def test_anthropic_adapter_rejects_incomplete_legacy_tool_turn() -> None:
    with pytest.raises(ValueError, match="无法安全恢复"):
        anthropic_request_body(
            _settings("anthropic"),
            [{
                "role": "assistant",
                "content": "",
                "tool_calls": [{
                    "id": "tool-1",
                    "function": {
                        "name": "file_write",
                        "arguments": '{"path":"a"}',
                    },
                }],
            }],
            (),
            None,
            stream=True,
        )


def test_anthropic_adapter_does_not_replay_state_from_another_model() -> None:
    body = anthropic_request_body(
        _settings("anthropic"),
        [
            {
                "role": "assistant",
                "content": "checking",
                "tool_calls": [{
                    "id": "tool-1",
                    "function": {
                        "name": "file_read",
                        "arguments": '{"path":"a"}',
                    },
                }],
                "provider_state": {
                    "apiFormat": "anthropic",
                    "scope": "another-model-scope",
                    "contentBlocks": [
                        {
                            "type": "thinking",
                            "thinking": "old",
                            "signature": "old-signature",
                        },
                        {
                            "type": "tool_use",
                            "id": "tool-1",
                            "name": "file_read",
                            "input": {"path": "a"},
                        },
                    ],
                },
            },
            {"role": "tool", "tool_call_id": "tool-1", "content": "ok"},
        ],
        (),
        None,
        stream=True,
    )

    serialized = json.dumps(body["messages"], ensure_ascii=False)
    assert "old-signature" not in serialized
    assert "兼容迁移" in serialized


def test_anthropic_adapter_parses_native_tool_use() -> None:
    turn = parse_anthropic_turn(
        {
            "model": "claude-example",
            "content": [
                {
                    "type": "thinking",
                    "thinking": "I should inspect the file.",
                    "signature": "signed-thinking",
                },
                {"type": "text", "text": "checking"},
                {
                    "type": "tool_use",
                    "id": "tool-1",
                    "name": "file_read",
                    "input": {"path": "a"},
                },
            ],
            "usage": {"input_tokens": 4, "output_tokens": 3},
        },
        "fallback",
    )

    assert turn.content == "checking"
    assert json.loads(turn.tool_calls[0].arguments_json) == {"path": "a"}
    assert turn.usage.total_tokens == 7
    assert turn.provider_state == {
        "apiFormat": "anthropic",
        "contentBlocks": [
            {
                "type": "thinking",
                "thinking": "I should inspect the file.",
                "signature": "signed-thinking",
            },
            {"type": "text", "text": "checking"},
            {
                "type": "tool_use",
                "id": "tool-1",
                "name": "file_read",
                "input": {"path": "a"},
            },
        ],
    }


def test_anthropic_adapter_enables_hosted_web_search() -> None:
    settings = replace(_settings("anthropic"), web_search_enabled=True)

    body = anthropic_request_body(settings, [], (), None, stream=True)

    assert body["tools"] == [{
        "type": "web_search_20250305",
        "name": "web_search",
    }]
    assert body["tool_choice"] == {"type": "auto"}


def test_anthropic_adapter_keeps_only_final_text_after_hosted_search() -> None:
    turn = parse_anthropic_turn(
        {
            "model": "claude-example",
            "content": [
                {"type": "text", "text": "我先搜索确认一下。"},
                {
                    "type": "server_tool_use",
                    "id": "search-1",
                    "name": "web_search",
                    "input": {"query": "official docs"},
                },
                {
                    "type": "web_search_tool_result",
                    "tool_use_id": "search-1",
                    "content": [],
                },
                {"type": "text", "text": "最终核实结果。"},
            ],
        },
        "fallback",
    )

    assert turn.content == "最终核实结果。"


class _AnthropicStreamingResponse:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    def raise_for_status(self) -> None:
        return None

    async def aiter_lines(self):
        events = [
            {
                "type": "message_start",
                "message": {
                    "model": "claude-example",
                    "usage": {"input_tokens": 4},
                },
            },
            {
                "type": "content_block_start",
                "index": 0,
                "content_block": {"type": "text", "text": ""},
            },
            {
                "type": "content_block_delta",
                "index": 0,
                "delta": {
                    "type": "text_delta",
                    "text": "我先搜索确认一下。",
                },
            },
            {
                "type": "content_block_start",
                "index": 1,
                "content_block": {
                    "type": "server_tool_use",
                    "id": "search-1",
                    "name": "web_search",
                },
            },
            {
                "type": "content_block_delta",
                "index": 1,
                "delta": {
                    "type": "input_json_delta",
                    "partial_json": '{"query":"official docs"}',
                },
            },
            {
                "type": "content_block_start",
                "index": 2,
                "content_block": {
                    "type": "web_search_tool_result",
                    "tool_use_id": "search-1",
                    "content": [{
                        "type": "web_search_result",
                        "title": "Documentation",
                        "url": "https://example.com/docs",
                    }],
                },
            },
            {
                "type": "content_block_start",
                "index": 3,
                "content_block": {"type": "text", "text": ""},
            },
            {
                "type": "content_block_delta",
                "index": 3,
                "delta": {
                    "type": "text_delta",
                    "text": "最终核实",
                },
            },
            {
                "type": "content_block_delta",
                "index": 3,
                "delta": {
                    "type": "text_delta",
                    "text": "结果。",
                },
            },
            {
                "type": "message_delta",
                "usage": {"output_tokens": 3},
            },
        ]
        for event in events:
            yield "data: " + json.dumps(event, ensure_ascii=False)


class _AnthropicRepeatedUsageResponse:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    def raise_for_status(self) -> None:
        return None

    async def aiter_lines(self):
        events = [
            {
                "type": "message_start",
                "message": {
                    "model": "deepseek-v4-pro",
                    "usage": {
                        "input_tokens": 40,
                        "cache_read_input_tokens": 960,
                        "output_tokens": 1,
                    },
                },
            },
            {
                "type": "content_block_start",
                "index": 0,
                "content_block": {"type": "text", "text": ""},
            },
            {
                "type": "content_block_delta",
                "index": 0,
                "delta": {"type": "text_delta", "text": "done"},
            },
            {
                "type": "message_delta",
                "delta": {"stop_reason": "end_turn"},
                "usage": {
                    "input_tokens": 40,
                    "cache_read_input_tokens": 960,
                    "output_tokens": 12,
                },
            },
        ]
        for event in events:
            yield "data: " + json.dumps(event)


class _AnthropicStreamingClient:
    def __init__(self, *_args, **_kwargs) -> None:
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    def stream(self, *_args, **_kwargs):
        return _AnthropicStreamingResponse()


class _AnthropicRepeatedUsageClient(_AnthropicStreamingClient):
    def stream(self, *_args, **_kwargs):
        return _AnthropicRepeatedUsageResponse()


class _AnthropicInterruptedUsageResponse(_AnthropicStreamingResponse):
    async def aiter_lines(self):
        events = [
            {
                "type": "message_start",
                "message": {
                    "model": "deepseek-v4-pro",
                    "usage": {
                        "input_tokens": 40,
                        "cache_read_input_tokens": 960,
                    },
                },
            },
            {
                "type": "content_block_delta",
                "index": 0,
                "delta": {
                    "type": "thinking_delta",
                    "thinking": "x" * 160,
                },
            },
        ]
        for event in events:
            yield "data: " + json.dumps(event)
        raise httpx.RemoteProtocolError("incomplete chunked read")


class _AnthropicInterruptedUsageClient(_AnthropicStreamingClient):
    def stream(self, *_args, **_kwargs):
        return _AnthropicInterruptedUsageResponse()


class _AnthropicContinuationResponse:
    def __init__(self, events: list[dict[str, Any]]) -> None:
        self._events = events

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    def raise_for_status(self) -> None:
        return None

    async def aiter_lines(self):
        for event in self._events:
            yield "data: " + json.dumps(event, ensure_ascii=False)


class _AnthropicContinuationClient:
    bodies: ClassVar[list[dict[str, Any]]] = []
    responses: ClassVar[list[list[dict[str, Any]]]] = []

    def __init__(self, *_args, **_kwargs) -> None:
        self._response_index = 0

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    def stream(self, *_args, **kwargs):
        self.bodies.append(kwargs["json"])
        response = _AnthropicContinuationResponse(
            self.responses[self._response_index]
        )
        self._response_index += 1
        return response


class _AnthropicCompletionResponse:
    def __init__(self, payload: dict[str, Any]) -> None:
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self):
        return self._payload


class _AnthropicCompletionClient:
    bodies: ClassVar[list[dict[str, Any]]] = []
    responses: ClassVar[list[dict[str, Any]]] = []

    def __init__(self, *_args, **_kwargs) -> None:
        self._response_index = 0

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def post(self, *_args, **kwargs):
        self.bodies.append(kwargs["json"])
        response = _AnthropicCompletionResponse(
            self.responses[self._response_index]
        )
        self._response_index += 1
        return response


def test_anthropic_stream_round_trips_signed_native_tool_turn(monkeypatch) -> None:
    _AnthropicContinuationClient.bodies = []
    _AnthropicContinuationClient.responses = [[
        {
            "type": "message_start",
            "message": {
                "model": "example-model",
                "usage": {"input_tokens": 4},
            },
        },
        {
            "type": "content_block_start",
            "index": 0,
            "content_block": {"type": "thinking", "thinking": ""},
        },
        {
            "type": "content_block_delta",
            "index": 0,
            "delta": {
                "type": "thinking_delta",
                "thinking": "I should inspect the file.",
            },
        },
        {
            "type": "content_block_delta",
            "index": 0,
            "delta": {
                "type": "signature_delta",
                "signature": "signed-thinking",
            },
        },
        {"type": "content_block_stop", "index": 0},
        {
            "type": "content_block_start",
            "index": 1,
            "content_block": {"type": "text", "text": ""},
        },
        {
            "type": "content_block_delta",
            "index": 1,
            "delta": {
                "type": "text_delta",
                "text": "I will inspect it.",
            },
        },
        {"type": "content_block_stop", "index": 1},
        {
            "type": "content_block_start",
            "index": 2,
            "content_block": {
                "type": "tool_use",
                "id": "tool-1",
                "name": "file_read",
                "input": {},
            },
        },
        {
            "type": "content_block_delta",
            "index": 2,
            "delta": {
                "type": "input_json_delta",
                "partial_json": (
                    '{"path":"a","optional":null,"items":[null,"x"]}'
                ),
            },
        },
        {"type": "content_block_stop", "index": 2},
        {
            "type": "message_delta",
            "delta": {"stop_reason": "tool_use"},
            "usage": {"output_tokens": 3},
        },
    ]]
    monkeypatch.setattr(
        "app.provider.anthropic_provider.httpx.AsyncClient",
        _AnthropicContinuationClient,
    )
    settings = _settings("anthropic")

    async def collect():
        return [
            event
            async for event in AnthropicProvider().stream_agent_turn(
                settings,
                [{"role": "user", "content": "inspect"}],
                (),
                None,
            )
        ]

    events = asyncio.run(collect())
    turn = events[-1].turn
    assert turn is not None
    assert turn.provider_state is not None
    assert len(turn.provider_state["scope"]) == 64
    native_content = [
        {
            "type": "thinking",
            "thinking": "I should inspect the file.",
            "signature": "signed-thinking",
        },
        {"type": "text", "text": "I will inspect it."},
        {
            "type": "tool_use",
            "id": "tool-1",
            "name": "file_read",
            "input": {
                "path": "a",
                "optional": None,
                "items": [None, "x"],
            },
        },
    ]
    assert turn.provider_state["contentBlocks"] == native_content

    next_body = anthropic_request_body(
        settings,
        [
            {"role": "user", "content": "inspect"},
            {
                "role": "assistant",
                "content": turn.content,
                "tool_calls": [{
                    "id": turn.tool_calls[0].call_id,
                    "function": {
                        "name": turn.tool_calls[0].name,
                        "arguments": turn.tool_calls[0].arguments_json,
                    },
                }],
                "provider_state": turn.provider_state,
            },
            {"role": "tool", "tool_call_id": "tool-1", "content": "ok"},
        ],
        (),
        None,
        stream=True,
    )

    assert next_body["messages"][1] == {
        "role": "assistant",
        "content": native_content,
    }


def test_anthropic_stream_keeps_pause_turn_blocks_before_local_tool(
    monkeypatch,
) -> None:
    _AnthropicContinuationClient.bodies = []
    _AnthropicContinuationClient.responses = [
        [
            {
                "type": "message_start",
                "message": {
                    "model": "example-model",
                    "usage": {"input_tokens": 3},
                },
            },
            {
                "type": "content_block_start",
                "index": 0,
                "content_block": {"type": "thinking", "thinking": ""},
            },
            {
                "type": "content_block_delta",
                "index": 0,
                "delta": {"type": "thinking_delta", "thinking": "search"},
            },
            {
                "type": "content_block_delta",
                "index": 0,
                "delta": {
                    "type": "signature_delta",
                    "signature": "search-signature",
                },
            },
            {"type": "content_block_stop", "index": 0},
            {
                "type": "content_block_start",
                "index": 1,
                "content_block": {
                    "type": "server_tool_use",
                    "id": "search-1",
                    "name": "web_search",
                    "input": {},
                },
            },
            {
                "type": "content_block_delta",
                "index": 1,
                "delta": {
                    "type": "input_json_delta",
                    "partial_json": '{"query":"docs"}',
                },
            },
            {"type": "content_block_stop", "index": 1},
            {
                "type": "message_delta",
                "delta": {"stop_reason": "pause_turn"},
                "usage": {"output_tokens": 2},
            },
        ],
        [
            {
                "type": "message_start",
                "message": {
                    "model": "example-model",
                    "usage": {"input_tokens": 5},
                },
            },
            {
                "type": "content_block_start",
                "index": 0,
                "content_block": {
                    "type": "web_search_tool_result",
                    "tool_use_id": "search-1",
                    "content": [{
                        "type": "web_search_result",
                        "title": "Docs",
                        "url": "https://example.com/docs",
                    }],
                },
            },
            {"type": "content_block_stop", "index": 0},
            {
                "type": "content_block_start",
                "index": 1,
                "content_block": {
                    "type": "tool_use",
                    "id": "tool-1",
                    "name": "file_read",
                    "input": {},
                },
            },
            {
                "type": "content_block_delta",
                "index": 1,
                "delta": {
                    "type": "input_json_delta",
                    "partial_json": '{"path":"README.md"}',
                },
            },
            {"type": "content_block_stop", "index": 1},
            {
                "type": "message_delta",
                "delta": {"stop_reason": "tool_use"},
                "usage": {"output_tokens": 3},
            },
        ],
    ]
    monkeypatch.setattr(
        "app.provider.anthropic_provider.httpx.AsyncClient",
        _AnthropicContinuationClient,
    )
    settings = replace(_settings("anthropic"), web_search_enabled=True)

    async def collect():
        return [
            event
            async for event in AnthropicProvider().stream_agent_turn(
                settings,
                [{"role": "user", "content": "search then inspect"}],
                (),
                None,
            )
        ]

    events = asyncio.run(collect())
    turn = events[-1].turn
    assert turn is not None
    assert turn.provider_state is not None
    blocks = turn.provider_state["contentBlocks"]
    assert [block["type"] for block in blocks] == [
        "thinking",
        "server_tool_use",
        "web_search_tool_result",
        "tool_use",
    ]
    assert blocks[0]["signature"] == "search-signature"
    assert blocks[-1]["input"] == {"path": "README.md"}
    assert _AnthropicContinuationClient.bodies[1]["messages"][-1][
        "content"
    ] == blocks[:2]

    next_body = anthropic_request_body(
        settings,
        [
            {"role": "user", "content": "search then inspect"},
            {
                "role": "assistant",
                "content": "",
                "tool_calls": [{
                    "id": "tool-1",
                    "function": {
                        "name": "file_read",
                        "arguments": '{"path":"README.md"}',
                    },
                }],
                "provider_state": turn.provider_state,
            },
            {"role": "tool", "tool_call_id": "tool-1", "content": "ok"},
        ],
        (),
        None,
        stream=True,
    )
    assert next_body["messages"][1]["content"] == blocks


def test_anthropic_stream_buffers_search_narration(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.provider.anthropic_provider.httpx.AsyncClient",
        _AnthropicStreamingClient,
    )
    settings = replace(_settings("anthropic"), web_search_enabled=True)

    async def collect():
        return [
            event
            async for event in AnthropicProvider().stream_agent_turn(
                settings,
                [{"role": "user", "content": "查询官方文档"}],
                (),
                None,
            )
        ]

    events = asyncio.run(collect())

    assert [event.type for event in events if event.type != "usage"] == [
        "web_search_started",
        "web_search_progress",
        "web_search_completed",
        "content_delta",
        "content_delta",
        "completed",
    ]
    assert [event.delta for event in events if event.type == "content_delta"] == [
        "最终核实",
        "结果。",
    ]
    assert events[-1].turn is not None
    assert events[-1].turn.content == "最终核实结果。"
    assert events[-1].turn.usage.total_tokens == 7


def test_anthropic_stream_reports_input_and_estimated_output_before_disconnect(
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        "app.provider.anthropic_provider.httpx.AsyncClient",
        _AnthropicInterruptedUsageClient,
    )
    captured = []

    async def collect() -> None:
        try:
            async for event in AnthropicProvider().stream_agent_turn(
                replace(
                    _settings("anthropic"),
                    provider_name="DeepSeek",
                    model="deepseek-v4-pro",
                ),
                [{"role": "user", "content": "continue"}],
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
    assert usage_events[0].usage.prompt_tokens == 1000
    assert usage_events[0].usage.cache_read_tokens == 960
    assert usage_events[1].usage is not None
    assert usage_events[1].usage.completion_tokens == 40
    assert usage_events[1].usage_estimated is True


def test_anthropic_stream_replaces_repeated_usage_snapshot(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.provider.anthropic_provider.httpx.AsyncClient",
        _AnthropicRepeatedUsageClient,
    )

    async def collect():
        return [
            event
            async for event in AnthropicProvider().stream_agent_turn(
                replace(
                    _settings("anthropic"),
                    provider_name="DeepSeek",
                    model="deepseek-v4-pro",
                ),
                [{"role": "user", "content": "continue"}],
                (),
                None,
            )
        ]

    events = asyncio.run(collect())
    usage = events[-1].turn.usage

    assert usage.prompt_tokens == 1000
    assert usage.input_tokens == 40
    assert usage.cache_read_tokens == 960
    assert usage.completion_tokens == 12
    assert usage.total_tokens == 1012


def test_anthropic_stream_continues_pause_turn_until_final_answer(monkeypatch) -> None:
    _AnthropicContinuationClient.bodies = []
    _AnthropicContinuationClient.responses = [
        [
            {
                "type": "message_start",
                "message": {
                    "model": "claude-example",
                    "usage": {"input_tokens": 4},
                },
            },
            {
                "type": "content_block_start",
                "index": 0,
                "content_block": {"type": "text", "text": ""},
            },
            {
                "type": "content_block_delta",
                "index": 0,
                "delta": {
                    "type": "text_delta",
                    "text": "我继续查看相关文件。",
                },
            },
            {"type": "content_block_stop", "index": 0},
            {
                "type": "content_block_start",
                "index": 1,
                "content_block": {
                    "type": "server_tool_use",
                    "id": "search-1",
                    "name": "web_search",
                    "input": {},
                },
            },
            {
                "type": "content_block_delta",
                "index": 1,
                "delta": {
                    "type": "input_json_delta",
                    "partial_json": '{"query":"codex agent module"}',
                },
            },
            {"type": "content_block_stop", "index": 1},
            {
                "type": "message_delta",
                "delta": {"stop_reason": "pause_turn"},
                "usage": {"output_tokens": 3},
            },
        ],
        [
            {
                "type": "message_start",
                "message": {
                    "model": "claude-example",
                    "usage": {"input_tokens": 6},
                },
            },
            {
                "type": "content_block_start",
                "index": 0,
                "content_block": {
                    "type": "web_search_tool_result",
                    "tool_use_id": "search-1",
                    "content": [{
                        "type": "web_search_result",
                        "title": "Codex source",
                        "url": "https://example.com/codex",
                    }],
                },
            },
            {
                "type": "content_block_start",
                "index": 1,
                "content_block": {"type": "text", "text": ""},
            },
            {
                "type": "content_block_delta",
                "index": 1,
                "delta": {
                    "type": "text_delta",
                    "text": "这是最终分析结果。",
                },
            },
            {"type": "content_block_stop", "index": 1},
            {
                "type": "message_delta",
                "delta": {"stop_reason": "end_turn"},
                "usage": {"output_tokens": 5},
            },
        ],
    ]
    monkeypatch.setattr(
        "app.provider.anthropic_provider.httpx.AsyncClient",
        _AnthropicContinuationClient,
    )
    settings = replace(_settings("anthropic"), web_search_enabled=True)

    async def collect():
        return [
            event
            async for event in AnthropicProvider().stream_agent_turn(
                settings,
                [{"role": "user", "content": "查询 Codex agent 模块"}],
                (),
                None,
            )
        ]

    events = asyncio.run(collect())

    assert len(_AnthropicContinuationClient.bodies) == 2
    continuation_messages = _AnthropicContinuationClient.bodies[1]["messages"]
    assert continuation_messages[-1]["role"] == "assistant"
    assert continuation_messages[-1]["content"] == [
        {"type": "text", "text": "我继续查看相关文件。"},
        {
            "type": "server_tool_use",
            "id": "search-1",
            "name": "web_search",
            "input": {"query": "codex agent module"},
        },
    ]
    assert [event.delta for event in events if event.type == "content_delta"] == [
        "这是最终分析结果。"
    ]
    assert all(event.type != "content_reset" for event in events)
    assert events[-1].turn is not None
    assert events[-1].turn.content == "这是最终分析结果。"
    assert events[-1].turn.usage.total_tokens == 18
    assert events[-1].turn.context_snapshot().tokens == 6
    assert events[-1].turn.context_snapshot().estimated is False


def test_anthropic_completion_continues_pause_turn(monkeypatch) -> None:
    paused_content = [
        {"type": "text", "text": "继续检索。"},
        {
            "type": "server_tool_use",
            "id": "search-1",
            "name": "web_search",
            "input": {"query": "official docs"},
        },
    ]
    _AnthropicCompletionClient.bodies = []
    _AnthropicCompletionClient.responses = [
        {
            "model": "claude-example",
            "stop_reason": "pause_turn",
            "content": paused_content,
            "usage": {"input_tokens": 4, "output_tokens": 3},
        },
        {
            "model": "claude-example",
            "stop_reason": "end_turn",
            "content": [
                {
                    "type": "web_search_tool_result",
                    "tool_use_id": "search-1",
                    "content": [],
                },
                {"type": "text", "text": "最终答案。"},
            ],
            "usage": {"input_tokens": 6, "output_tokens": 5},
        },
    ]
    monkeypatch.setattr(
        "app.provider.anthropic_provider.httpx.AsyncClient",
        _AnthropicCompletionClient,
    )
    settings = replace(_settings("anthropic"), web_search_enabled=True)

    turn = asyncio.run(
        AnthropicProvider().complete_agent_turn(
            settings,
            [{"role": "user", "content": "查询官方文档"}],
            (),
            None,
        )
    )

    assert len(_AnthropicCompletionClient.bodies) == 2
    assert _AnthropicCompletionClient.bodies[1]["messages"][-1] == {
        "role": "assistant",
        "content": paused_content,
    }
    assert turn.content == "最终答案。"
    assert turn.usage.total_tokens == 18
    assert turn.context_snapshot().tokens == 6
    assert turn.context_snapshot().estimated is False


class _Adapter:
    def __init__(self, name: str) -> None:
        self.name = name

    async def list_models(self, _settings: ModelConnectionSettings) -> list[str]:
        return [self.name]

    async def complete_agent_turn(
        self,
        settings: ModelConnectionSettings,
        messages: list[dict[str, Any]],
        tools: tuple[dict[str, Any], ...],
        reasoning_effort: str | None,
    ) -> ProviderTurn:
        del messages, tools, reasoning_effort
        return ProviderTurn(
            content=self.name,
            reasoning="",
            model=settings.model,
            usage=TokenUsageResponse(
                promptTokens=0, completionTokens=0, totalTokens=0
            ),
            tool_calls=(),
        )


def test_routing_provider_selects_api_format() -> None:
    adapters = {
        "chat-completions": _Adapter("chat"),
        "responses": _Adapter("responses"),
        "anthropic": _Adapter("anthropic"),
    }
    provider = RoutingModelProvider(adapters=adapters)  # type: ignore[arg-type]

    assert asyncio.run(provider.list_models(_settings("responses"))) == ["responses"]
    assert asyncio.run(provider.list_models(_settings("anthropic"))) == ["anthropic"]
