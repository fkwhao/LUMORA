import json
import uuid
from collections.abc import AsyncIterator
from typing import Any

import httpx

from app.dto.response.chat_completion_response import TokenUsageResponse
from app.harness.contracts import (
    ProviderToolCall,
    ProviderTurn,
    ProviderTurnEvent,
    ProviderWebSource,
)
from app.model.model_connection_settings import ModelConnectionSettings
from app.prompt.prompt_loader import PromptLoader
from app.provider.attachment_content import openai_chat_messages
from app.provider.http_client import create_model_http_client
from app.provider.protocol_provider import ProtocolProviderBase


class LumoraCloudProvider(ProtocolProviderBase):
    """Official-plan adapter using LUMORA's provider-neutral protocol v1."""

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
        # The signed Cloud catalog is synchronized by Electron. The local Agent
        # must not probe provider-native model-list endpoints.
        return [settings.model]

    async def complete_agent_turn(
        self,
        settings: ModelConnectionSettings,
        messages: list[dict[str, Any]],
        tools: tuple[dict[str, Any], ...],
        reasoning_effort: str | None,
    ) -> ProviderTurn:
        response = await self._client().post(
            f"{settings.base_url}/invoke",
            headers=_headers(settings),
            json=_request_body(
                settings,
                messages,
                tools,
                reasoning_effort,
                stream=False,
            ),
            timeout=120.0,
        )
        response.raise_for_status()
        return _parse_turn(response.json(), settings.model)

    async def stream_agent_turn(
        self,
        settings: ModelConnectionSettings,
        messages: list[dict[str, Any]],
        tools: tuple[dict[str, Any], ...],
        reasoning_effort: str | None,
    ) -> AsyncIterator[ProviderTurnEvent]:
        completed: ProviderTurn | None = None
        async with self._client().stream(
            "POST",
            f"{settings.base_url}/invoke",
            headers=_headers(settings),
            json=_request_body(
                settings,
                messages,
                tools,
                reasoning_effort,
                stream=True,
            ),
            timeout=120.0,
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if not data or data == "[DONE]":
                    continue
                event = json.loads(data)
                event_type = str(event.get("type") or "")
                model = str(
                    event.get("resolvedModel")
                    or event.get("model")
                    or settings.model
                )
                if event_type == "content_delta":
                    yield ProviderTurnEvent(
                        type="content_delta",
                        delta=str(event.get("delta") or ""),
                        model=model,
                    )
                elif event_type == "reasoning_delta":
                    yield ProviderTurnEvent(
                        type="reasoning_delta",
                        delta=str(event.get("delta") or ""),
                        model=model,
                    )
                elif event_type == "tool_call_delta":
                    yield ProviderTurnEvent(type="tool_call_delta", model=model)
                elif event_type in {
                    "web_search_started",
                    "web_search_progress",
                    "web_search_completed",
                    "web_search_failed",
                }:
                    yield ProviderTurnEvent(
                        type=event_type,
                        item_id=str(event.get("itemId") or event.get("item_id") or ""),
                        query=str(event.get("query") or ""),
                        delta=str(event.get("delta") or ""),
                        sources=_web_sources(event.get("sources")),
                        error_message=str(
                            event.get("errorMessage")
                            or event.get("error_message")
                            or ""
                        ),
                        model=model,
                    )
                elif event_type == "usage":
                    yield ProviderTurnEvent(
                        type="usage",
                        model=model,
                        usage=_usage(event.get("usage")),
                        usage_estimated=False,
                    )
                elif event_type == "completed":
                    completed = _parse_turn(event, settings.model)
        if completed is None:
            raise ValueError("LUMORA Cloud 模型流未返回完整回合")
        yield ProviderTurnEvent(
            type="completed",
            model=completed.model,
            turn=completed,
        )


def _request_body(
    settings: ModelConnectionSettings,
    messages: list[dict[str, Any]],
    tools: tuple[dict[str, Any], ...],
    reasoning_effort: str | None,
    *,
    stream: bool,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "protocolVersion": "1",
        "model": settings.model,
        "stream": stream,
        "messages": _internal_messages(messages),
        "tools": [_internal_tool(tool) for tool in tools],
        "generation": {},
        "features": {"webSearch": settings.web_search_enabled},
    }
    generation = body["generation"]
    if settings.max_output_tokens is not None:
        generation["maxOutputTokens"] = settings.max_output_tokens
    if reasoning_effort:
        generation["reasoningEffort"] = reasoning_effort
    return body


def _internal_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    converted: list[dict[str, Any]] = []
    for message in openai_chat_messages(messages):
        target: dict[str, Any] = {
            "role": str(message.get("role") or ""),
            "content": _content_parts(message.get("content")),
        }
        raw_calls = message.get("tool_calls") or []
        if raw_calls:
            target["toolCalls"] = [
                {
                    "id": str(call.get("id") or uuid.uuid4()),
                    "name": str((call.get("function") or {}).get("name") or ""),
                    "arguments": str(
                        (call.get("function") or {}).get("arguments") or "{}"
                    ),
                }
                for call in raw_calls
                if isinstance(call, dict)
            ]
        if message.get("tool_call_id"):
            target["toolCallId"] = str(message["tool_call_id"])
        provider_state = message.get("provider_state")
        if isinstance(provider_state, dict) and provider_state:
            target["providerState"] = provider_state
        converted.append(target)
    return converted


def _content_parts(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, str):
        return [{"type": "text", "text": value}] if value else []
    parts: list[dict[str, Any]] = []
    if not isinstance(value, list):
        return parts
    for raw in value:
        if not isinstance(raw, dict):
            continue
        if raw.get("type") == "text":
            parts.append({"type": "text", "text": str(raw.get("text") or "")})
        elif raw.get("type") == "image_url":
            image = raw.get("image_url") or {}
            parts.append({"type": "image", "url": str(image.get("url") or "")})
    return parts


def _internal_tool(tool: dict[str, Any]) -> dict[str, Any]:
    function = tool.get("function") or {}
    return {
        "name": str(function.get("name") or ""),
        "description": str(function.get("description") or ""),
        "inputSchema": function.get("parameters") or {"type": "object"},
    }


def _parse_turn(payload: dict[str, Any], fallback_model: str) -> ProviderTurn:
    result = payload.get("result") or {}
    calls = tuple(
        ProviderToolCall(
            call_id=str(call.get("id") or uuid.uuid4()),
            name=str(call.get("name") or ""),
            arguments_json=str(call.get("arguments") or "{}"),
        )
        for call in result.get("toolCalls") or []
        if isinstance(call, dict)
    )
    provider_state = result.get("providerState")
    return ProviderTurn(
        content=str(result.get("content") or ""),
        reasoning=str(result.get("reasoning") or ""),
        model=str(result.get("model") or payload.get("model") or fallback_model),
        usage=_usage(payload.get("usage")),
        tool_calls=calls,
        provider_state=(
            dict(provider_state) if isinstance(provider_state, dict) else None
        ),
    )


def _usage(value: Any) -> TokenUsageResponse:
    return TokenUsageResponse.model_validate(value if isinstance(value, dict) else {})


def _web_sources(value: Any) -> tuple[ProviderWebSource, ...]:
    if not isinstance(value, list):
        return ()
    sources: list[ProviderWebSource] = []
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, dict):
            continue
        url = str(item.get("url") or "").strip()
        if not url or url in seen:
            continue
        title = str(item.get("title") or url).strip() or url
        seen.add(url)
        sources.append(ProviderWebSource(title=title[:500], url=url[:2_000]))
        if len(sources) >= 12:
            break
    return tuple(sources)


def _headers(settings: ModelConnectionSettings) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.api_key}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream, application/json",
    }
