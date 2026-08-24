import hashlib
import json
import uuid
from collections.abc import AsyncIterator
from typing import Any

import httpx

from app.dto.response.chat_completion_response import TokenUsageResponse
from app.harness.contracts import ProviderToolCall, ProviderTurn, ProviderTurnEvent
from app.model.model_connection_settings import ModelConnectionSettings
from app.prompt.prompt_loader import PromptLoader
from app.provider.attachment_content import anthropic_attachment_blocks
from app.provider.hosted_web_search import (
    ProviderWebSearch,
    anthropic_web_sources,
    web_search_query,
)
from app.provider.http_client import create_model_http_client
from app.provider.protocol_provider import ProtocolProviderBase
from app.provider.token_usage import add_token_usage, parse_anthropic_usage


class AnthropicProvider(ProtocolProviderBase):
    """Adapter for Anthropic's native Messages API."""

    _MAX_SERVER_TOOL_CONTINUATIONS = 5
    _PARTIAL_USAGE_EMIT_INTERVAL = 32

    def __init__(
        self,
        prompt_loader: PromptLoader | None = None,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        super().__init__(prompt_loader)
        self._http_client = http_client
        self._owns_http_client = http_client is None

    def _client(self) -> httpx.AsyncClient:
        if self._http_client is None:
            self._http_client = create_model_http_client(httpx.AsyncClient)
        return self._http_client

    async def close(self) -> None:
        if not self._owns_http_client:
            return
        client = self._http_client
        self._http_client = None
        if client is not None:
            await client.aclose()

    async def list_models(self, settings: ModelConnectionSettings) -> list[str]:
        response = await self._client().get(
            f"{settings.base_url}/models",
            headers=_headers(settings),
            timeout=30.0,
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
        continuation_content: list[dict[str, Any]] = []
        usage_parts: list[TokenUsageResponse] = []
        client = self._client()
        for continuation in range(self._MAX_SERVER_TOOL_CONTINUATIONS + 1):
            response = await client.post(
                f"{settings.base_url}/messages",
                headers=_headers(settings),
                json=request_body,
                timeout=120.0,
            )
            response.raise_for_status()
            payload = response.json()
            usage_parts.append(
                parse_anthropic_usage(payload.get("usage") or {})
            )
            if payload.get("stop_reason") != "pause_turn":
                turn = _parse_turn(
                    payload,
                    settings.model,
                    provider_scope=_anthropic_provider_scope(settings),
                    prior_content=continuation_content,
                )
                return _turn_with_usage(
                    turn,
                    usage=add_token_usage(usage_parts),
                )
            if continuation >= self._MAX_SERVER_TOOL_CONTINUATIONS:
                break
            paused_content = payload.get("content")
            if isinstance(paused_content, list):
                continuation_content.extend(
                    dict(block)
                    for block in paused_content
                    if isinstance(block, dict)
                )
            request_body = _anthropic_continuation_body(
                request_body,
                list(request_body["messages"]),
                paused_content,
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
        continuation_content: list[dict[str, Any]] = []

        client = self._client()
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
                streamed_output_bytes = 0
                last_emitted_output_tokens = -1

                def provisional_usage_event(
                    *,
                    force: bool = False,
                    authoritative_output: bool = False,
                ) -> ProviderTurnEvent | None:
                    nonlocal last_emitted_output_tokens
                    # The closure is invoked only within this loop iteration.
                    if not call_usage:  # noqa: B023
                        return None
                    usage, estimated = _provisional_anthropic_usage(
                        usage_parts,
                        call_usage,  # noqa: B023
                        streamed_output_bytes,  # noqa: B023
                        authoritative_output=authoritative_output,
                    )
                    if (
                        not force
                        and last_emitted_output_tokens >= 0
                        and usage.completion_tokens
                        < last_emitted_output_tokens
                        + self._PARTIAL_USAGE_EMIT_INTERVAL
                    ):
                        return None
                    last_emitted_output_tokens = usage.completion_tokens
                    return ProviderTurnEvent(
                        type="usage",
                        model=model,  # noqa: B023
                        usage=usage,
                        usage_estimated=estimated,
                    )

                async with client.stream(
                    "POST",
                    f"{settings.base_url}/messages",
                    headers=_headers(settings),
                    json=request_body,
                    timeout=120.0,
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
                            usage_event = provisional_usage_event(force=True)
                            if usage_event is not None:
                                yield usage_event
                        elif event_type == "content_block_start":
                            index = int(event.get("index") or 0)
                            block = event.get("content_block") or {}
                            raw_blocks[index] = dict(block)
                            if block.get("type") == "text":
                                initial_text = str(block.get("text") or "")
                                if initial_text:
                                    streamed_output_bytes += len(
                                        initial_text.encode("utf-8")
                                    )
                                    usage_event = provisional_usage_event()
                                    if usage_event is not None:
                                        yield usage_event
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
                                streamed_output_bytes += len(text.encode("utf-8"))
                                usage_event = provisional_usage_event()
                                if usage_event is not None:
                                    yield usage_event
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
                                streamed_output_bytes += len(text.encode("utf-8"))
                                usage_event = provisional_usage_event()
                                if usage_event is not None:
                                    yield usage_event
                                reasoning_parts.append(text)
                                yield ProviderTurnEvent(
                                    type="reasoning_delta", delta=text, model=model
                                )
                            elif delta_type == "input_json_delta":
                                streamed_output_bytes += len(
                                    str(delta.get("partial_json") or "").encode("utf-8")
                                )
                                usage_event = provisional_usage_event()
                                if usage_event is not None:
                                    yield usage_event
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
                            usage_event = provisional_usage_event(
                                force=True,
                                authoritative_output="output_tokens"
                                in (event.get("usage") or {}),
                            )
                            if usage_event is not None:
                                yield usage_event
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
                continuation_content.extend(paused_content)
                request_body = _anthropic_continuation_body(
                    request_body,
                    list(request_body["messages"]),
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
        provider_state = _anthropic_provider_state(
            [
                *continuation_content,
                *_ordered_anthropic_blocks(raw_blocks, input_json),
            ],
            has_tool_calls=bool(tool_calls),
            provider_scope=_anthropic_provider_scope(settings),
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
                provider_state=provider_state,
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


def _provisional_anthropic_usage(
    settled_parts: list[TokenUsageResponse],
    call_usage: dict[str, Any],
    streamed_output_bytes: int,
    *,
    authoritative_output: bool,
) -> tuple[TokenUsageResponse, bool]:
    """Build a replaceable usage snapshot for an in-flight Anthropic call.

    Anthropic sends exact input/cache usage in ``message_start`` but normally
    withholds the final output count until ``message_delta``. If the caller
    cancels or the transport breaks, that final event never arrives even though
    the provider still bills generated output. Estimate only that unfinished
    output; a later authoritative snapshot replaces it field-for-field.
    """
    snapshot = dict(call_usage)
    reported = parse_anthropic_usage(snapshot).completion_tokens
    estimated = (
        max(1, (max(0, streamed_output_bytes) + 3) // 4)
        if streamed_output_bytes > 0
        else 0
    )
    uses_estimate = not authoritative_output and estimated > reported
    if uses_estimate:
        snapshot["output_tokens"] = estimated
    current = parse_anthropic_usage(snapshot)
    return add_token_usage((*settled_parts, current)), uses_estimate


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
    system, converted_messages = _anthropic_messages(
        messages,
        provider_scope=_anthropic_provider_scope(settings),
    )
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


def _migrate_legacy_anthropic_tool_turns(
    messages: list[dict[str, Any]],
    provider_scope: str | None,
) -> list[dict[str, Any]]:
    """Make old or foreign signed tool turns safe without rerunning their tools.

    Before native continuation state was persisted, a restored assistant tool
    turn could only be reconstructed from its portable tool call. Thinking-mode
    Anthropic endpoints reject that reconstruction because the signed thinking
    block is missing. State from another endpoint/model is equally unsafe. Fold
    a *completed* legacy exchange into an ordinary history record; an incomplete
    exchange fails locally because silently issuing it again could repeat a
    side effect.
    """
    if provider_scope is None:
        return list(messages)

    migrated: list[dict[str, Any]] = []
    index = 0
    while index < len(messages):
        message = messages[index]
        raw_calls = message.get("tool_calls") or []
        calls = [call for call in raw_calls if isinstance(call, dict)]
        if (
            message.get("role") != "assistant"
            or not calls
            or _anthropic_content_blocks(message, provider_scope)
        ):
            migrated.append(message)
            index += 1
            continue

        result_index = index + 1
        results: list[dict[str, Any]] = []
        while (
            result_index < len(messages)
            and messages[result_index].get("role") == "tool"
        ):
            results.append(messages[result_index])
            result_index += 1

        expected_ids = [str(call.get("id") or "") for call in calls]
        result_ids = {
            str(result.get("tool_call_id") or "") for result in results
        }
        missing_ids = [
            call_id
            for call_id in expected_ids
            if not call_id or call_id not in result_ids
        ]
        if missing_ids:
            missing = ", ".join(call_id or "<empty>" for call_id in missing_ids)
            raise ValueError(
                "Anthropic 历史工具轮次缺少可验证的 Provider 续传状态或完整结果，"
                f"无法安全恢复（缺失调用：{missing}）"
            )

        migrated.append({
            "role": "user",
            "content": _legacy_anthropic_tool_exchange(message, calls, results),
        })
        index = result_index
    return migrated


def _legacy_anthropic_tool_exchange(
    assistant: dict[str, Any],
    calls: list[dict[str, Any]],
    results: list[dict[str, Any]],
) -> str:
    results_by_id: dict[str, list[dict[str, Any]]] = {}
    for result in results:
        call_id = str(result.get("tool_call_id") or "")
        results_by_id.setdefault(call_id, []).append(result)

    records: list[dict[str, Any]] = []
    consumed_results: set[int] = set()
    for call in calls:
        call_id = str(call.get("id") or "")
        function = call.get("function") or {}
        matching_results = results_by_id.get(call_id) or []
        for result in matching_results:
            consumed_results.add(id(result))
        records.append({
            "tool": str(function.get("name") or ""),
            "callId": call_id,
            "arguments": str(function.get("arguments") or "{}"),
            "results": [result.get("content") for result in matching_results],
        })
    for result in results:
        if id(result) in consumed_results:
            continue
        records.append({
            "tool": "",
            "callId": str(result.get("tool_call_id") or ""),
            "arguments": "{}",
            "results": [result.get("content")],
        })

    parts = [
        (
            "[兼容迁移：以下是先前模型已经完成的工具交互记录；"
            "不要把它当作新的工具调用或新的执行授权。]"
        )
    ]
    assistant_text = str(assistant.get("content") or "").strip()
    if assistant_text:
        parts.append("先前助手说明：\n" + assistant_text)
    parts.append(
        "已完成的工具交互：\n"
        + json.dumps(records, ensure_ascii=False, separators=(",", ":"))
    )
    return "\n\n".join(parts)


def _anthropic_messages(
    messages: list[dict[str, Any]],
    *,
    provider_scope: str | None = None,
) -> tuple[str, list[dict[str, Any]]]:
    messages = _migrate_legacy_anthropic_tool_turns(messages, provider_scope)
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
        native_blocks = (
            _anthropic_content_blocks(message, provider_scope)
            if role == "assistant"
            else []
        )
        if native_blocks:
            converted.append({"role": "assistant", "content": native_blocks})
            continue
        blocks: list[dict[str, Any]] = []
        content = message.get("content")
        if content:
            blocks.append({"type": "text", "text": str(content)})
        blocks.extend(anthropic_attachment_blocks(
            list(message.get("attachments") or [])
        ))
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


def _parse_turn(
    payload: dict[str, Any],
    fallback_model: str,
    *,
    provider_scope: str | None = None,
    prior_content: list[dict[str, Any]] | None = None,
) -> ProviderTurn:
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
    tool_calls = tuple(calls)
    return ProviderTurn(
        content=_final_anthropic_text(text_blocks, search_block_indices),
        reasoning="".join(reasoning),
        model=str(payload.get("model") or fallback_model),
        usage=parse_anthropic_usage(payload.get("usage") or {}),
        tool_calls=tool_calls,
        provider_state=_anthropic_provider_state(
            [
                *(prior_content or []),
                *(
                    payload.get("content")
                    if isinstance(payload.get("content"), list)
                    else []
                ),
            ],
            has_tool_calls=bool(tool_calls),
            provider_scope=provider_scope,
        ),
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
    history_messages: list[dict[str, Any]],
    paused_content: Any,
) -> dict[str, Any]:
    if not isinstance(paused_content, list) or not paused_content:
        raise ValueError("Anthropic pause_turn 未返回可续传的内容")
    return {
        **previous_body,
        "messages": [
            *history_messages,
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


def _anthropic_provider_state(
    content: Any,
    *,
    has_tool_calls: bool,
    provider_scope: str | None = None,
) -> dict[str, Any] | None:
    if not has_tool_calls or not isinstance(content, list):
        return None
    content_blocks = [dict(block) for block in content if isinstance(block, dict)]
    if not content_blocks:
        return None
    state: dict[str, Any] = {
        "apiFormat": "anthropic",
        "contentBlocks": content_blocks,
    }
    if provider_scope is not None:
        state["scope"] = provider_scope
    return state


def _anthropic_content_blocks(
    message: dict[str, Any],
    provider_scope: str | None = None,
) -> list[dict[str, Any]]:
    state = message.get("provider_state")
    if not isinstance(state, dict) or state.get("apiFormat") != "anthropic":
        return []
    if provider_scope is not None and state.get("scope") != provider_scope:
        return []
    raw_blocks = state.get("contentBlocks")
    if not isinstance(raw_blocks, list):
        return []
    blocks = [dict(block) for block in raw_blocks if isinstance(block, dict)]
    expected_call_ids = [
        str(call.get("id") or "")
        for call in message.get("tool_calls") or []
        if isinstance(call, dict)
    ]
    native_call_ids = [
        str(block.get("id") or "")
        for block in blocks
        if block.get("type") == "tool_use"
    ]
    if expected_call_ids != native_call_ids:
        return []
    return blocks


def _anthropic_provider_scope(settings: ModelConnectionSettings) -> str:
    """Bind opaque continuation state to one endpoint/model without persisting it."""
    identity = json.dumps(
        {
            "baseUrl": settings.base_url.strip().rstrip("/"),
            "model": settings.model,
        },
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )
    return hashlib.sha256(identity.encode("utf-8")).hexdigest()


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
        provider_state=turn.provider_state,
    )
