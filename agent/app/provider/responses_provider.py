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
    responses_web_searches,
)
from app.provider.protocol_provider import ProtocolProviderBase


class ResponsesProvider(ProtocolProviderBase):
    """OpenAI Responses API adapter."""

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
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{settings.base_url}/responses",
                headers=_headers(settings),
                json=_request_body(
                    settings,
                    messages,
                    tools,
                    reasoning_effort,
                    stream=False,
                ),
            )
            response.raise_for_status()
            payload = response.json()
        return _parse_turn(payload, settings.model)

    async def stream_agent_turn(
        self,
        settings: ModelConnectionSettings,
        messages: list[dict[str, Any]],
        tools: tuple[dict[str, Any], ...],
        reasoning_effort: str | None,
    ) -> AsyncIterator[ProviderTurnEvent]:
        model = settings.model
        content_parts: list[str] = []
        reasoning_parts: list[str] = []
        calls: dict[str, dict[str, str]] = {}
        usage = TokenUsageResponse(
            promptTokens=0,
            completionTokens=0,
            totalTokens=0,
        )
        completed_payload: dict[str, Any] | None = None
        searches: dict[str, ProviderWebSearch] = {}
        candidate_parts: list[str] = []
        candidate_streaming = False
        candidate_content_emitted = False
        candidate_item_id = ""

        request_body = _request_body(
            settings,
            messages,
            tools,
            reasoning_effort,
            stream=True,
        )
        async with httpx.AsyncClient(timeout=120.0) as client:
            lines = _response_sse_lines(
                client,
                f"{settings.base_url}/responses",
                _headers(settings),
                request_body,
            )
            async for line in lines:
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if not data or data == "[DONE]":
                    continue
                event = json.loads(data)
                event_type = str(event.get("type") or "")
                if event_type == "response.created":
                    model = str((event.get("response") or {}).get("model") or model)
                elif event_type in {
                    "response.output_text.delta",
                    "response.refusal.delta",
                }:
                    delta = str(event.get("delta") or "")
                    if delta:
                        content_parts.append(delta)
                        if not settings.web_search_enabled:
                            yield ProviderTurnEvent(
                                type="content_delta",
                                delta=delta,
                                model=model,
                            )
                        else:
                            candidate_item_id = str(
                                event.get("item_id")
                                or event.get("output_index")
                                or candidate_item_id
                            )
                            candidate_parts.append(delta)
                            if candidate_streaming:
                                candidate_content_emitted = True
                                yield ProviderTurnEvent(
                                    type="content_delta",
                                    delta=delta,
                                    model=model,
                                )
                elif event_type == "response.reasoning_summary_text.delta":
                    delta = str(event.get("delta") or "")
                    if delta:
                        reasoning_parts.append(delta)
                        yield ProviderTurnEvent(
                            type="reasoning_delta",
                            delta=delta,
                            model=model,
                        )
                elif event_type == "response.output_item.added":
                    item = event.get("item") or {}
                    item_type = str(item.get("type") or "")
                    item_id = str(
                        item.get("id") or event.get("output_index") or ""
                    )
                    if (
                        settings.web_search_enabled
                        and candidate_parts
                        and item_type in {"message", "function_call", "web_search_call"}
                        and item_id != candidate_item_id
                    ):
                        # A completed message followed by another output item is
                        # a stage update, not text that should disappear. The
                        # runtime moves it from the provisional answer area into
                        # the persistent work log before clearing that area.
                        yield ProviderTurnEvent(
                            type="stage_content",
                            delta="".join(candidate_parts).strip(),
                            item_id=candidate_item_id,
                            model=model,
                        )
                        candidate_parts.clear()
                        candidate_content_emitted = False
                        candidate_item_id = ""
                    if item_type == "message":
                        candidate_item_id = item_id
                    elif item_type == "function_call":
                        if candidate_content_emitted:
                            yield ProviderTurnEvent(
                                type="content_reset",
                                model=model,
                            )
                            candidate_parts.clear()
                            candidate_content_emitted = False
                            candidate_item_id = ""
                        candidate_streaming = False
                        key = str(item.get("id") or event.get("output_index") or uuid.uuid4())
                        calls[key] = {
                            "id": str(item.get("call_id") or key),
                            "name": str(item.get("name") or ""),
                            "arguments": str(item.get("arguments") or ""),
                        }
                        yield ProviderTurnEvent(type="tool_call_delta", model=model)
                    elif item_type == "web_search_call":
                        if candidate_content_emitted:
                            yield ProviderTurnEvent(
                                type="content_reset",
                                model=model,
                            )
                            candidate_parts.clear()
                            candidate_content_emitted = False
                            candidate_item_id = ""
                        candidate_streaming = False
                        search = _response_search(item)
                        searches[search.item_id] = search
                        yield ProviderTurnEvent(
                            type="web_search_started",
                            item_id=search.item_id,
                            query=search.query,
                            model=model,
                        )
                elif event_type == "response.function_call_arguments.delta":
                    key = str(event.get("item_id") or event.get("output_index") or "")
                    current = calls.setdefault(
                        key,
                        {"id": key, "name": "", "arguments": ""},
                    )
                    current["arguments"] += str(event.get("delta") or "")
                    yield ProviderTurnEvent(type="tool_call_delta", model=model)
                elif event_type == "response.function_call_arguments.done":
                    key = str(event.get("item_id") or event.get("output_index") or "")
                    current = calls.setdefault(
                        key,
                        {"id": key, "name": "", "arguments": ""},
                    )
                    current["arguments"] = str(
                        event.get("arguments") or current["arguments"] or "{}"
                    )
                elif event_type == "response.output_item.done":
                    _merge_function_call(calls, event.get("item"))
                    item = event.get("item") or {}
                    if item.get("type") == "web_search_call":
                        search = _response_search(item)
                        searches[search.item_id] = search
                        candidate_streaming = True
                        yield ProviderTurnEvent(
                            type="web_search_progress",
                            item_id=search.item_id,
                            query=search.query,
                            delta="已完成检索，正在整理结果…",
                            model=model,
                        )
                elif event_type == "response.web_search_call.in_progress":
                    if candidate_parts:
                        yield ProviderTurnEvent(
                            type="stage_content",
                            delta="".join(candidate_parts).strip(),
                            item_id=candidate_item_id,
                            model=model,
                        )
                        candidate_parts.clear()
                        candidate_content_emitted = False
                        candidate_item_id = ""
                    candidate_streaming = False
                    search = _event_search(event, searches)
                    searches[search.item_id] = search
                    yield ProviderTurnEvent(
                        type="web_search_started",
                        item_id=search.item_id,
                        query=search.query,
                        model=model,
                    )
                elif event_type == "response.web_search_call.searching":
                    search = _event_search(event, searches)
                    searches[search.item_id] = search
                    yield ProviderTurnEvent(
                        type="web_search_progress",
                        item_id=search.item_id,
                        query=search.query,
                        delta="正在检索网页…",
                        model=model,
                    )
                elif event_type == "response.web_search_call.completed":
                    search = _event_search(event, searches)
                    searches[search.item_id] = search
                    candidate_streaming = True
                    yield ProviderTurnEvent(
                        type="web_search_progress",
                        item_id=search.item_id,
                        query=search.query,
                        delta="已完成检索，正在整理结果…",
                        model=model,
                    )
                elif event_type in {"response.completed", "response.incomplete"}:
                    completed_payload = event.get("response") or {}
                    model = str(completed_payload.get("model") or model)
                    usage = _parse_usage(completed_payload.get("usage") or {})
                    completed_searches = responses_web_searches(completed_payload)
                    for search in completed_searches:
                        searches[search.item_id] = search
                    for search in searches.values():
                        yield ProviderTurnEvent(
                            type="web_search_completed",
                            item_id=search.item_id,
                            query=search.query,
                            sources=search.sources,
                            model=model,
                        )
                elif event_type in {"response.failed", "error"}:
                    for search in searches.values():
                        yield ProviderTurnEvent(
                            type="web_search_failed",
                            item_id=search.item_id,
                            query=search.query,
                            error_message="网络搜索失败",
                            model=model,
                        )
                    raise ValueError(_response_failure_message(event))

        if completed_payload is not None:
            parsed = _parse_turn(completed_payload, model)
            if settings.web_search_enabled:
                final_item_id, parsed_final_content = _final_response_message(
                    completed_payload
                )
                final_content = (
                    parsed_final_content
                    or parsed.content
                    or "".join(candidate_parts)
                    or "".join(content_parts)
                )
                content_parts = [final_content] if final_content else []
                candidate_content = "".join(candidate_parts)
                same_final_item = not (
                    final_item_id
                    and candidate_item_id
                    and final_item_id != candidate_item_id
                )
                if (
                    candidate_content_emitted
                    and same_final_item
                    and final_content.startswith(candidate_content)
                ):
                    remaining = final_content[len(candidate_content):]
                    if remaining:
                        yield ProviderTurnEvent(
                            type="content_delta",
                            delta=remaining,
                            model=parsed.model,
                        )
                    candidate_content = final_content
                elif candidate_content_emitted and candidate_content != final_content:
                    yield ProviderTurnEvent(
                        type=(
                            "stage_content" if not same_final_item else "content_reset"
                        ),
                        delta=candidate_content.strip() if not same_final_item else "",
                        item_id=candidate_item_id,
                        model=parsed.model,
                    )
                    candidate_content_emitted = False
                if final_content and not candidate_content_emitted:
                    yield ProviderTurnEvent(
                        type="content_delta",
                        delta=final_content,
                        model=parsed.model,
                    )
            elif not content_parts and parsed.content:
                content_parts.append(parsed.content)
            if not reasoning_parts and parsed.reasoning:
                reasoning_parts.append(parsed.reasoning)
            if not calls:
                for call in parsed.tool_calls:
                    calls[call.call_id] = {
                        "id": call.call_id,
                        "name": call.name,
                        "arguments": call.arguments_json,
                    }
        tool_calls = tuple(
            ProviderToolCall(
                call_id=call["id"] or str(uuid.uuid4()),
                name=call["name"],
                arguments_json=call["arguments"] or "{}",
            )
            for call in calls.values()
        )
        yield ProviderTurnEvent(
            type="completed",
            model=model,
            turn=ProviderTurn(
                content="".join(content_parts),
                reasoning="".join(reasoning_parts),
                model=model,
                usage=usage,
                tool_calls=tool_calls,
            ),
        )


def _headers(settings: ModelConnectionSettings) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.api_key}",
        "Content-Type": "application/json",
    }


async def _response_sse_lines(
    client: httpx.AsyncClient,
    url: str,
    headers: dict[str, str],
    request_body: dict[str, Any],
) -> AsyncIterator[str]:
    bodies = [request_body]
    if "include" in request_body:
        bodies.append({
            key: value
            for key, value in request_body.items()
            if key != "include"
        })
    for index, body in enumerate(bodies):
        async with client.stream(
            "POST",
            url,
            headers=headers,
            json=body,
        ) as response:
            if response.is_error:
                error_body = (await response.aread()).decode(
                    response.encoding or "utf-8",
                    errors="replace",
                )
                can_retry = (
                    index == 0
                    and len(bodies) > 1
                    and _include_is_unsupported(response.status_code, error_body)
                )
                if can_retry:
                    continue
                response.raise_for_status()
            async for line in response.aiter_lines():
                yield line
            return


def _include_is_unsupported(status_code: int, error_body: str) -> bool:
    if status_code not in {400, 422}:
        return False
    normalized = error_body.casefold()
    names_include = (
        "include" in normalized
        or "web_search_call.action.sources" in normalized
    )
    rejects_parameter = any(
        marker in normalized
        for marker in (
            "unknown parameter",
            "unsupported parameter",
            "unrecognized",
            "extra inputs are not permitted",
            "invalid parameter",
        )
    )
    return names_include and rejects_parameter


def _request_body(
    settings: ModelConnectionSettings,
    messages: list[dict[str, Any]],
    tools: tuple[dict[str, Any], ...],
    reasoning_effort: str | None,
    *,
    stream: bool,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "model": settings.model,
        "input": _responses_input(messages),
        "stream": stream,
    }
    resolved_tools = [_responses_tool(tool) for tool in tools]
    if settings.web_search_enabled:
        resolved_tools.append({"type": "web_search"})
        # OpenAI exposes the complete consulted source list through this opt-in.
        # Compatible providers that do not implement `include` may ignore it.
        body["include"] = ["web_search_call.action.sources"]
    if resolved_tools:
        body["tools"] = resolved_tools
        body["tool_choice"] = "auto"
    if settings.max_output_tokens is not None:
        body["max_output_tokens"] = settings.max_output_tokens
    if reasoning_effort and reasoning_effort != "none":
        body["reasoning"] = {"effort": reasoning_effort}
    return body


def _responses_input(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for message in messages:
        role = str(message.get("role") or "")
        if role == "tool":
            items.append({
                "type": "function_call_output",
                "call_id": str(message.get("tool_call_id") or ""),
                "output": str(message.get("content") or ""),
            })
            continue
        content = message.get("content")
        if content:
            items.append({"role": role, "content": str(content)})
        for raw_call in message.get("tool_calls") or []:
            function = raw_call.get("function") or {}
            call_id = str(raw_call.get("id") or uuid.uuid4())
            items.append({
                "type": "function_call",
                "call_id": call_id,
                "name": str(function.get("name") or ""),
                "arguments": str(function.get("arguments") or "{}"),
            })
    return items


def _responses_tool(tool: dict[str, Any]) -> dict[str, Any]:
    function = tool.get("function") or {}
    return {
        "type": "function",
        "name": str(function.get("name") or ""),
        "description": str(function.get("description") or ""),
        "parameters": function.get("parameters") or {"type": "object"},
    }


def _parse_turn(payload: dict[str, Any], fallback_model: str) -> ProviderTurn:
    message_contents: list[str] = []
    reasoning: list[str] = []
    calls: list[ProviderToolCall] = []
    for item in payload.get("output") or []:
        if not isinstance(item, dict):
            continue
        item_type = item.get("type")
        if item_type == "message":
            item_content: list[str] = []
            for block in item.get("content") or []:
                if not isinstance(block, dict):
                    continue
                if block.get("type") == "output_text":
                    item_content.append(str(block.get("text") or ""))
                elif block.get("type") == "refusal":
                    item_content.append(str(block.get("refusal") or ""))
            if item_content:
                message_contents.append("".join(item_content))
        elif item_type == "function_call":
            calls.append(ProviderToolCall(
                call_id=str(item.get("call_id") or item.get("id") or uuid.uuid4()),
                name=str(item.get("name") or ""),
                arguments_json=str(item.get("arguments") or "{}"),
            ))
        elif item_type == "reasoning":
            for block in item.get("summary") or []:
                if isinstance(block, dict) and block.get("type") == "summary_text":
                    reasoning.append(str(block.get("text") or ""))
    return ProviderTurn(
        # Responses can interleave message items with hosted tool calls. The
        # final message is the answer; earlier messages are tool narration.
        content=message_contents[-1] if message_contents else "",
        reasoning="".join(reasoning),
        model=str(payload.get("model") or fallback_model),
        usage=_parse_usage(payload.get("usage") or {}),
        tool_calls=tuple(calls),
    )


def _final_response_message(payload: dict[str, Any]) -> tuple[str, str]:
    """Return the id and text of the last message output item."""
    for item in reversed(payload.get("output") or []):
        if not isinstance(item, dict) or item.get("type") != "message":
            continue
        content = "".join(
            str(
                block.get("text")
                if block.get("type") == "output_text"
                else block.get("refusal")
                if block.get("type") == "refusal"
                else ""
            )
            for block in item.get("content") or []
            if isinstance(block, dict)
        )
        if content:
            return str(item.get("id") or ""), content
    return "", ""


def _parse_usage(usage: dict[str, Any]) -> TokenUsageResponse:
    prompt = int(usage.get("input_tokens") or 0)
    completion = int(usage.get("output_tokens") or 0)
    return TokenUsageResponse(
        promptTokens=prompt,
        completionTokens=completion,
        totalTokens=int(usage.get("total_tokens") or prompt + completion),
    )


def _response_failure_message(event: dict[str, Any]) -> str:
    response = event.get("response") or {}
    error = response.get("error") or event.get("error") or {}
    if isinstance(error, str):
        detail = error.strip()
    elif isinstance(error, dict):
        detail = str(error.get("message") or error.get("code") or "").strip()
    else:
        detail = ""
    return f"Responses API 流式调用失败: {detail}" if detail else (
        "Responses API 流式调用失败"
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


def _merge_function_call(
    calls: dict[str, dict[str, str]],
    raw_item: Any,
) -> None:
    if not isinstance(raw_item, dict) or raw_item.get("type") != "function_call":
        return
    key = str(raw_item.get("id") or raw_item.get("call_id") or uuid.uuid4())
    current = calls.setdefault(
        key,
        {"id": "", "name": "", "arguments": ""},
    )
    current["id"] = str(raw_item.get("call_id") or current["id"] or key)
    current["name"] = str(raw_item.get("name") or current["name"])
    current["arguments"] = str(
        raw_item.get("arguments") or current["arguments"] or "{}"
    )


def _response_search(raw_item: Any) -> ProviderWebSearch:
    if not isinstance(raw_item, dict):
        raw_item = {}
    parsed = responses_web_searches({"output": [raw_item]})
    if parsed:
        return parsed[0]
    return ProviderWebSearch(
        item_id=str(raw_item.get("id") or uuid.uuid4()),
    )


def _event_search(
    event: dict[str, Any],
    searches: dict[str, ProviderWebSearch],
) -> ProviderWebSearch:
    item_id = str(event.get("item_id") or event.get("id") or uuid.uuid4())
    current = searches.get(item_id)
    if current is not None:
        return current
    return ProviderWebSearch(item_id=item_id)
