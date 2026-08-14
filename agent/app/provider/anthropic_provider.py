import json
import uuid
from collections.abc import AsyncIterator
from typing import Any

import httpx

from app.dto.response.chat_completion_response import TokenUsageResponse
from app.harness.contracts import ProviderToolCall, ProviderTurn, ProviderTurnEvent
from app.model.model_connection_settings import ModelConnectionSettings
from app.provider.hosted_web_search import (
    ProviderWebSearch,
    anthropic_web_sources,
    web_search_query,
)
from app.provider.protocol_provider import ProtocolProviderBase
from app.provider.token_usage import add_token_usage, parse_anthropic_usage


class AnthropicProvider(ProtocolProviderBase):
    """Adapter for Anthropic's native Messages API."""

    _MAX_SERVER_TOOL_CONTINUATIONS = 5

    async def list_models(self, settings: ModelConnectionSettings) -> list[str]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{settings.base_url}/models",
                headers=_headers(settings),
            )
            response.raise_for_status()
            payload = response.json()
        return _parse_model_list(payload)

    async def complete_agent_turn(
        self,
        settings: ModelConnectionSettings,
        messages: list[dict[str, Any]],
        tools: tuple[dict[str, Any], ...],
        reasoning_effort: str | None,
    ) -> ProviderTurn:
        request_body = _request_body(
            settings,
            messages,
            tools,
            reasoning_effort,
            stream=False,
        )
        base_messages = list(request_body["messages"])
        usage_parts: list[TokenUsageResponse] = []
        async with httpx.AsyncClient(timeout=120.0) as client:
            for continuation in range(self._MAX_SERVER_TOOL_CONTINUATIONS + 1):
                response = await client.post(
                    f"{settings.base_url}/messages",
                    headers=_headers(settings),
                    json=request_body,
                )
                response.raise_for_status()
                payload = response.json()
                usage_parts.append(
                    parse_anthropic_usage(payload.get("usage") or {})
                )
                if payload.get("stop_reason") != "pause_turn":
                    turn = _parse_turn(payload, settings.model)
                    return _turn_with_usage(
                        turn,
                        usage=add_token_usage(usage_parts),
                    )
                if continuation >= self._MAX_SERVER_TOOL_CONTINUATIONS:
                    break
                request_body = _anthropic_continuation_body(
                    request_body,
                    base_messages,
                    payload.get("content"),
                )
        raise ValueError("Anthropic 服务端工具续跑次数超过限制")

    async def stream_agent_turn(
        self,
        settings: ModelConnectionSettings,
        messages: list[dict[str, Any]],
        tools: tuple[dict[str, Any], ...],
        reasoning_effort: str | None,
    ) -> AsyncIterator[ProviderTurnEvent]:
        model = settings.model
        reasoning_parts: list[str] = []
        searches: dict[str, dict[str, Any]] = {}
        usage_parts: list[TokenUsageResponse] = []
        request_body = _request_body(
            settings,
            messages,
            tools,
            reasoning_effort,
            stream=True,
        )
        base_messages = list(request_body["messages"])

        async with httpx.AsyncClient(timeout=120.0) as client:
            for continuation in range(self._MAX_SERVER_TOOL_CONTINUATIONS + 1):
                text_blocks: dict[int, list[str]] = {}
                calls: dict[int, dict[str, str]] = {}
                search_indices: dict[int, str] = {}
                search_block_indices: set[int] = set()
                raw_blocks: dict[int, dict[str, Any]] = {}
                input_json: dict[int, str] = {}
                stop_reason = ""
                candidate_streaming = False
                candidate_content_emitted = False
                # Anthropic streaming usage is one call-level snapshot split
                # across message_start and message_delta. Newer compatible
                # endpoints may repeat input/cache fields in message_delta, so
                # adding both events would count the same tokens twice.
                call_usage: dict[str, Any] = {}
                async with client.stream(
                    "POST",
                    f"{settings.base_url}/messages",
                    headers=_headers(settings),
                    json=request_body,
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        raw = line[5:].strip()
                        if not raw or raw == "[DONE]":
                            continue
                        event = json.loads(raw)
                        event_type = event.get("type")
                        if event_type == "message_start":
                            message = event.get("message") or {}
                            model = str(message.get("model") or model)
                            _merge_anthropic_stream_usage(
                                call_usage,
                                message.get("usage"),
                            )
                        elif event_type == "content_block_start":
                            index = int(event.get("index") or 0)
                            block = event.get("content_block") or {}
                            raw_blocks[index] = dict(block)
                            if block.get("type") == "text":
                                initial_text = str(block.get("text") or "")
                                if initial_text:
                                    text_blocks.setdefault(index, []).append(initial_text)
                                    if (
                                        settings.web_search_enabled
                                        and candidate_streaming
                                    ):
                                        candidate_content_emitted = True
                                        yield ProviderTurnEvent(
                                            type="content_delta",
                                            delta=initial_text,
                                            model=model,
                                        )
                            elif block.get("type") == "tool_use":
                                if candidate_content_emitted:
                                    yield ProviderTurnEvent(
                                        type="stage_content",
                                        delta=_final_anthropic_text(
                                            text_blocks,
                                            search_block_indices,
                                        ).strip(),
                                        item_id=_anthropic_stage_item_id(
                                            continuation,
                                            text_blocks,
                                        ),
                                        model=model,
                                    )
                                    candidate_content_emitted = False
                                candidate_streaming = False
                                calls[index] = {
                                    "id": str(block.get("id") or uuid.uuid4()),
                                    "name": str(block.get("name") or ""),
                                    "arguments": "",
                                }
                                yield ProviderTurnEvent(
                                    type="tool_call_delta", model=model
                                )
                            elif block.get("type") == "server_tool_use" and (
                                block.get("name") == "web_search"
                            ):
                                if candidate_content_emitted:
                                    yield ProviderTurnEvent(
                                        type="stage_content",
                                        delta=_final_anthropic_text(
                                            text_blocks,
                                            search_block_indices,
                                        ).strip(),
                                        item_id=_anthropic_stage_item_id(
                                            continuation,
                                            text_blocks,
                                        ),
                                        model=model,
                                    )
                                    candidate_content_emitted = False
                                candidate_streaming = False
                                search_block_indices.add(index)
                                raw_input = block.get("input") or {}
                                search_id = str(block.get("id") or uuid.uuid4())
                                search = {
                                    "id": search_id,
                                    "input_json": "",
                                    "query": web_search_query(raw_input),
                                }
                                searches[search_id] = search
                                search_indices[index] = search_id
                                yield ProviderTurnEvent(
                                    type="web_search_started",
                                    item_id=search["id"],
                                    query=search["query"],
                                    model=model,
                                )
                            elif block.get("type") == "web_search_tool_result":
                                search_block_indices.add(index)
                                candidate_streaming = True
                                search = _matching_anthropic_search(
                                    searches,
                                    str(block.get("tool_use_id") or ""),
                                )
                                sources = anthropic_web_sources(block)
                                yield ProviderTurnEvent(
                                    type="web_search_completed",
                                    item_id=search.item_id,
                                    query=search.query,
                                    sources=sources,
                                    model=model,
                                )
                        elif event_type == "content_block_delta":
                            index = int(event.get("index") or 0)
                            delta = event.get("delta") or {}
                            delta_type = delta.get("type")
                            _merge_anthropic_stream_delta(
                                raw_blocks,
                                input_json,
                                index,
                                delta,
                            )
                            if delta_type == "text_delta":
                                text = str(delta.get("text") or "")
                                text_blocks.setdefault(index, []).append(text)
                                # Claude may narrate before and between hosted
                                # searches. Text after a result is a candidate
                                # final answer: stream it now, but reset it if
                                # Claude starts another search or pauses.
                                if not settings.web_search_enabled:
                                    yield ProviderTurnEvent(
                                        type="content_delta", delta=text, model=model
                                    )
                                elif candidate_streaming:
                                    candidate_content_emitted = True
                                    yield ProviderTurnEvent(
                                        type="content_delta", delta=text, model=model
                                    )
                            elif delta_type == "thinking_delta":
                                text = str(delta.get("thinking") or "")
                                reasoning_parts.append(text)
                                yield ProviderTurnEvent(
                                    type="reasoning_delta", delta=text, model=model
                                )
                            elif delta_type == "input_json_delta":
                                search_id = search_indices.get(index)
                                if search_id is not None:
                                    search = searches[search_id]
                                    search["input_json"] = input_json.get(index, "")
                                    parsed = _json_object(search["input_json"])
                                    query = web_search_query(parsed)
                                    if query:
                                        search["query"] = query
                                    yield ProviderTurnEvent(
                                        type="web_search_progress",
                                        item_id=search["id"],
                                        query=search["query"],
                                        delta="正在检索网页…",
                                        model=model,
                                    )
                                    continue
                                current = calls.setdefault(
                                    index,
                                    {
                                        "id": str(uuid.uuid4()),
                                        "name": "",
                                        "arguments": "",
                                    },
                                )
                                current["arguments"] = input_json.get(index, "")
                                yield ProviderTurnEvent(
                                    type="tool_call_delta", model=model
                                )
                        elif event_type == "content_block_stop":
                            _finalize_anthropic_stream_block(
                                raw_blocks,
                                input_json,
                                int(event.get("index") or 0),
                            )
                        elif event_type == "message_delta":
                            stop_reason = str(
                                (event.get("delta") or {}).get("stop_reason")
                                or stop_reason
                            )
                            _merge_anthropic_stream_usage(
                                call_usage,
                                event.get("usage"),
                            )
                        elif event_type == "error":
                            for search in searches.values():
                                yield ProviderTurnEvent(
                                    type="web_search_failed",
                                    item_id=search["id"],
                                    query=search["query"],
                                    error_message="网络搜索失败",
                                    model=model,
                                )
                            raise ValueError("Anthropic Messages API 流式调用失败")

                if call_usage:
                    usage_parts.append(parse_anthropic_usage(call_usage))
                if stop_reason != "pause_turn":
                    break
                if candidate_content_emitted:
                    yield ProviderTurnEvent(
                        type="stage_content",
                        delta=_final_anthropic_text(
                            text_blocks,
                            search_block_indices,
                        ).strip(),
                        item_id=_anthropic_stage_item_id(
                            continuation,
                            text_blocks,
                        ),
                        model=model,
                    )
                if continuation >= self._MAX_SERVER_TOOL_CONTINUATIONS:
                    raise ValueError("Anthropic 服务端工具续跑次数超过限制")
                paused_content = _ordered_anthropic_blocks(
                    raw_blocks,
                    input_json,
                )
                request_body = _anthropic_continuation_body(
                    request_body,
                    base_messages,
                    paused_content,
                )
            else:
                raise ValueError("Anthropic 服务端工具续跑次数超过限制")

        content = _final_anthropic_text(text_blocks, search_block_indices)
        if (
            settings.web_search_enabled
            and content
            and not candidate_content_emitted
        ):
            yield ProviderTurnEvent(
                type="content_delta",
                delta=content,
                model=model,
            )
        tool_calls = tuple(
            ProviderToolCall(
                call_id=call["id"],
                name=call["name"],
                arguments_json=call["arguments"] or "{}",
            )
            for call in calls.values()
        )
        yield ProviderTurnEvent(
            type="completed",
            model=model,
            turn=ProviderTurn(
                content=content,
                reasoning="".join(reasoning_parts),
                model=model,
                usage=add_token_usage(usage_parts),
                tool_calls=tool_calls,
            ),
        )


def _merge_anthropic_stream_usage(
    current: dict[str, Any],
    update: Any,
) -> None:
    """Merge partial snapshots for one Anthropic streaming API call.

    Each field is cumulative for the current call. A later occurrence replaces
    the earlier value; separate server-tool continuation calls are still summed.
    """
    if not isinstance(update, dict):
        return
    current.update(update)


def _headers(settings: ModelConnectionSettings) -> dict[str, str]:
    return {
        "x-api-key": settings.api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }


def _request_body(
    settings: ModelConnectionSettings,
    messages: list[dict[str, Any]],
    tools: tuple[dict[str, Any], ...],
    reasoning_effort: str | None,
    *,
    stream: bool,
) -> dict[str, Any]:
    system, converted_messages = _anthropic_messages(messages)
    body: dict[str, Any] = {
        "model": settings.model,
        "messages": converted_messages,
        "max_tokens": settings.max_output_tokens or 8192,
        "stream": stream,
    }
    if system:
        body["system"] = system
    converted_tools = [_anthropic_tool(tool) for tool in tools]
    if settings.web_search_enabled:
        converted_tools.append({
            "type": "web_search_20250305",
            "name": "web_search",
        })
    if converted_tools:
        body["tools"] = converted_tools
        body["tool_choice"] = {"type": "auto"}
    max_tokens = int(body["max_tokens"])
    if (
        reasoning_effort
        and reasoning_effort != "none"
        and max_tokens > 1_024
    ):
        body["thinking"] = {
            "type": "enabled",
            "budget_tokens": _thinking_budget(
                reasoning_effort,
                max_tokens,
            ),
        }
    return body


def _anthropic_messages(
    messages: list[dict[str, Any]],
) -> tuple[str, list[dict[str, Any]]]:
    system_parts: list[str] = []
    converted: list[dict[str, Any]] = []
    pending_results: list[dict[str, Any]] = []

    def flush_results() -> None:
        if pending_results:
            converted.append({"role": "user", "content": [*pending_results]})
            pending_results.clear()

    for message in messages:
        role = str(message.get("role") or "")
        if role == "system":
            system_parts.append(str(message.get("content") or ""))
            continue
        if role == "tool":
            pending_results.append({
                "type": "tool_result",
                "tool_use_id": str(message.get("tool_call_id") or ""),
                "content": str(message.get("content") or ""),
            })
            continue
        flush_results()
        blocks: list[dict[str, Any]] = []
        content = message.get("content")
        if content:
            blocks.append({"type": "text", "text": str(content)})
        for raw_call in message.get("tool_calls") or []:
            function = raw_call.get("function") or {}
            arguments = str(function.get("arguments") or "{}")
            try:
                parsed_arguments = json.loads(arguments)
            except json.JSONDecodeError:
                parsed_arguments = {}
            blocks.append({
                "type": "tool_use",
                "id": str(raw_call.get("id") or uuid.uuid4()),
                "name": str(function.get("name") or ""),
                "input": parsed_arguments,
            })
        if blocks:
            converted.append({
                "role": "assistant" if role == "assistant" else "user",
                "content": blocks,
            })
    flush_results()
    return "\n\n".join(part for part in system_parts if part), converted


def _anthropic_tool(tool: dict[str, Any]) -> dict[str, Any]:
    function = tool.get("function") or {}
    return {
        "name": str(function.get("name") or ""),
        "description": str(function.get("description") or ""),
        "input_schema": function.get("parameters") or {"type": "object"},
    }


def _parse_turn(payload: dict[str, Any], fallback_model: str) -> ProviderTurn:
    text_blocks: dict[int, list[str]] = {}
    search_block_indices: set[int] = set()
    reasoning: list[str] = []
    calls: list[ProviderToolCall] = []
    for index, block in enumerate(payload.get("content") or []):
        if not isinstance(block, dict):
            continue
        block_type = block.get("type")
        if block_type == "text":
            text_blocks.setdefault(index, []).append(str(block.get("text") or ""))
        elif block_type == "thinking":
            reasoning.append(str(block.get("thinking") or ""))
        elif (
            block_type == "server_tool_use" and block.get("name") == "web_search"
        ) or block_type == "web_search_tool_result":
            search_block_indices.add(index)
        elif block_type == "tool_use":
            calls.append(ProviderToolCall(
                call_id=str(block.get("id") or uuid.uuid4()),
                name=str(block.get("name") or ""),
                arguments_json=json.dumps(
                    block.get("input") or {}, ensure_ascii=False, separators=(",", ":")
                ),
            ))
    return ProviderTurn(
        content=_final_anthropic_text(text_blocks, search_block_indices),
        reasoning="".join(reasoning),
        model=str(payload.get("model") or fallback_model),
        usage=parse_anthropic_usage(payload.get("usage") or {}),
        tool_calls=tuple(calls),
    )


def _parse_model_list(payload: Any) -> list[str]:
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, list):
        raise TypeError("模型列表响应格式无效")
    models = sorted({
        str(item.get("id") or "").strip()
        for item in data
        if isinstance(item, dict) and str(item.get("id") or "").strip()
    })
    if not models:
        raise ValueError("供应商未返回可用模型")
    return models


def _thinking_budget(effort: str, max_tokens: int) -> int:
    ratios = {"low": 0.2, "medium": 0.4, "high": 0.6, "xhigh": 0.75}
    return min(
        max_tokens - 1,
        max(1024, int(max_tokens * ratios.get(effort, 0.4))),
    )


def _matching_anthropic_search(
    searches: dict[str, dict[str, Any]],
    tool_use_id: str,
) -> ProviderWebSearch:
    for search in searches.values():
        if search["id"] == tool_use_id or not tool_use_id:
            return ProviderWebSearch(
                item_id=search["id"],
                query=search["query"],
            )
    return ProviderWebSearch(item_id=tool_use_id or str(uuid.uuid4()))


def _json_object(value: str) -> dict[str, Any]:
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _final_anthropic_text(
    text_blocks: dict[int, list[str]],
    search_block_indices: set[int],
) -> str:
    """Return the answer text, excluding narration before hosted searches."""
    boundary = max(search_block_indices, default=-1)
    return "".join(
        "".join(text_blocks[index])
        for index in sorted(text_blocks)
        if index > boundary
    )


def _anthropic_stage_item_id(
    continuation: int,
    text_blocks: dict[int, list[str]],
) -> str:
    return f"anthropic-stage-{continuation}-{max(text_blocks, default=0)}"


def _anthropic_continuation_body(
    previous_body: dict[str, Any],
    base_messages: list[dict[str, Any]],
    paused_content: Any,
) -> dict[str, Any]:
    if not isinstance(paused_content, list) or not paused_content:
        raise ValueError("Anthropic pause_turn 未返回可续传的内容")
    return {
        **previous_body,
        "messages": [
            *base_messages,
            {"role": "assistant", "content": paused_content},
        ],
    }


def _merge_anthropic_stream_delta(
    blocks: dict[int, dict[str, Any]],
    input_json: dict[int, str],
    index: int,
    delta: dict[str, Any],
) -> None:
    block = blocks.setdefault(index, {})
    delta_type = delta.get("type")
    if delta_type == "text_delta":
        block["text"] = str(block.get("text") or "") + str(delta.get("text") or "")
    elif delta_type == "thinking_delta":
        block["thinking"] = str(block.get("thinking") or "") + str(
            delta.get("thinking") or ""
        )
    elif delta_type == "signature_delta":
        block["signature"] = str(block.get("signature") or "") + str(
            delta.get("signature") or ""
        )
    elif delta_type == "input_json_delta":
        input_json[index] = input_json.get(index, "") + str(
            delta.get("partial_json") or ""
        )
    elif delta_type == "citations_delta":
        citation = delta.get("citation")
        if isinstance(citation, dict):
            block.setdefault("citations", []).append(citation)


def _finalize_anthropic_stream_block(
    blocks: dict[int, dict[str, Any]],
    input_json: dict[int, str],
    index: int,
) -> None:
    raw_input = input_json.get(index)
    if raw_input is None:
        return
    block = blocks.setdefault(index, {})
    block["input"] = _json_object(raw_input)


def _ordered_anthropic_blocks(
    blocks: dict[int, dict[str, Any]],
    input_json: dict[int, str],
) -> list[dict[str, Any]]:
    for index in input_json:
        _finalize_anthropic_stream_block(blocks, input_json, index)
    return [blocks[index] for index in sorted(blocks) if blocks[index].get("type")]


def _turn_with_usage(
    turn: ProviderTurn,
    *,
    usage: TokenUsageResponse,
) -> ProviderTurn:
    return ProviderTurn(
        content=turn.content,
        reasoning=turn.reasoning,
        model=turn.model,
        usage=usage,
        tool_calls=turn.tool_calls,
    )
