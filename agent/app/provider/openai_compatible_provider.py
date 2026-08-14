import json
import uuid
from collections.abc import AsyncIterator
from typing import Any

import httpx

from app.context.estimator import TokenEstimator
from app.context.planner import summary_output_tokens
from app.dto.request.chat_completion_request import ChatMessageRequest
from app.dto.response.chat_completion_response import (
    ChatCompletionResponse,
    TokenUsageResponse,
)
from app.harness.contracts import (
    ProviderToolCall,
    ProviderTurn,
    ProviderTurnEvent,
)
from app.harness.run_event import RunEvent, RunUsage
from app.model.model_connection_settings import ModelConnectionSettings
from app.prompt.prompt_assembly import PromptAssembly
from app.prompt.prompt_loader import PromptLoader
from app.provider.token_usage import estimate_stream_usage, parse_chat_usage


class OpenAICompatibleProvider:
    """调用实现 OpenAI Chat Completions 契约的第三方模型服务。"""

    _PARTIAL_USAGE_EMIT_INTERVAL = 32

    def __init__(self, prompt_loader: PromptLoader | None = None) -> None:
        self._prompt_loader = prompt_loader or PromptLoader()

    async def list_models(
        self,
        settings: ModelConnectionSettings,
    ) -> list[str]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{settings.base_url}/models",
                headers={
                    "Authorization": f"Bearer {settings.api_key}",
                    "Content-Type": "application/json",
                },
            )
            response.raise_for_status()
            payload = response.json()
        data = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(data, list):
            raise TypeError("模型列表响应格式无效")
        models = {
            item.get("id", "").strip()
            for item in data
            if isinstance(item, dict) and isinstance(item.get("id"), str)
        }
        resolved = sorted(model for model in models if model)
        if not resolved:
            raise ValueError("供应商未返回可用模型")
        return resolved

    async def complete(
        self,
        settings: ModelConnectionSettings,
        prompt: PromptAssembly,
        messages: list[ChatMessageRequest],
        reasoning_effort: str | None = None,
    ) -> ChatCompletionResponse:
        request_body = self._request_body(
            settings,
            prompt,
            messages,
            stream=False,
            reasoning_effort=reasoning_effort,
        )
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{settings.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.api_key}",
                    "Content-Type": "application/json",
                },
                json=request_body,
            )
            response.raise_for_status()
            payload = response.json()
        return self._parse_response(payload, settings.model)

    async def compact_context(
        self,
        settings: ModelConnectionSettings,
        messages: list[ChatMessageRequest],
        existing_summary: str | None = None,
    ) -> ChatCompletionResponse:
        source_messages: list[dict[str, Any]] = []
        if existing_summary:
            source_messages.append({
                "role": "user",
                "content": "已有的早期对话摘要：\n" + existing_summary,
            })
        source_messages.extend(
            {"role": message.role, "content": message.content}
            for message in messages
        )
        source_messages.append({
            "role": "user",
            "content": self._prompt_loader.load_specialized(
                "context_compaction_request"
            ),
        })
        request_body: dict[str, Any] = {
            "model": settings.model,
            "messages": [
                {
                    "role": "system",
                    "content": self._prompt_loader.load_specialized(
                        "context_compaction_system"
                    ),
                },
                *source_messages,
            ],
            "stream": False,
            "max_tokens": summary_output_tokens(settings),
        }
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{settings.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.api_key}",
                    "Content-Type": "application/json",
                },
                json=request_body,
            )
            response.raise_for_status()
            payload = response.json()
        return self._parse_response(payload, settings.model)

    async def compact_agent_history(
        self,
        settings: ModelConnectionSettings,
        messages: list[dict[str, Any]],
        existing_summary: str | None = None,
    ) -> ChatCompletionResponse:
        """Summarize completed Agent Loop history without replaying tool calls."""
        rendered = json.dumps(messages, ensure_ascii=False, separators=(",", ":"))
        source = []
        if existing_summary:
            source.append("已有上下文摘要：\n" + existing_summary)
        source.append("待压缩的模型可见历史（JSON）：\n" + rendered)
        request_body: dict[str, Any] = {
            "model": settings.model,
            "messages": [
                {
                    "role": "system",
                    "content": self._prompt_loader.load_specialized(
                        "agent_history_compaction"
                    ),
                },
                {
                    "role": "user",
                    "content": "\n\n".join(source),
                },
            ],
            "stream": False,
            "max_tokens": summary_output_tokens(settings),
        }
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{settings.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.api_key}",
                    "Content-Type": "application/json",
                },
                json=request_body,
            )
            response.raise_for_status()
            payload = response.json()
        return self._parse_response(payload, settings.model)

    async def stream(
        self,
        settings: ModelConnectionSettings,
        prompt: PromptAssembly,
        messages: list[ChatMessageRequest],
        reasoning_effort: str | None = None,
    ) -> AsyncIterator[RunEvent]:
        request_body = self._request_body(
            settings,
            prompt,
            messages,
            stream=True,
            reasoning_effort=reasoning_effort,
        )
        resolved_model = settings.model
        estimator = TokenEstimator()
        estimated_active_context_tokens = (
            estimator.estimate_messages(request_body["messages"])
            + estimator.estimate_tools(tuple(request_body.get("tools", [])))
        )
        usage_received = False
        async with httpx.AsyncClient(timeout=60.0) as client, client.stream(
            "POST",
            f"{settings.base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.api_key}",
                "Content-Type": "application/json",
            },
            json=request_body,
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                if not data:
                    continue
                payload = json.loads(data)
                resolved_model = str(
                    payload.get("model") or resolved_model
                )
                choices = payload.get("choices") or []
                if choices:
                    delta = choices[0].get("delta") or {}
                    reasoning = (
                        delta.get("reasoning_content")
                        or delta.get("reasoning")
                    )
                    if isinstance(reasoning, str) and reasoning:
                        yield RunEvent(
                            type="reasoning_delta",
                            delta=reasoning,
                            model=resolved_model,
                        )
                    content = delta.get("content")
                    if isinstance(content, str) and content:
                        yield RunEvent(
                            type="text_delta",
                            delta=content,
                            model=resolved_model,
                        )
                usage = payload.get("usage")
                if isinstance(usage, dict):
                    usage_received = True
                    parsed_usage = self._parse_usage(usage)
                    yield RunEvent(
                        type="usage",
                        model=resolved_model,
                        usage=RunUsage(
                            prompt_tokens=parsed_usage.prompt_tokens,
                            completion_tokens=parsed_usage.completion_tokens,
                            total_tokens=parsed_usage.total_tokens,
                            input_tokens=parsed_usage.input_tokens,
                            output_tokens=parsed_usage.output_tokens,
                            reasoning_tokens=parsed_usage.reasoning_tokens,
                            cache_read_tokens=parsed_usage.cache_read_tokens,
                            cache_write_tokens=parsed_usage.cache_write_tokens,
                            cache_metrics_available=(
                                parsed_usage.cache_metrics_available
                            ),
                        ),
                        active_context_tokens=(
                            parsed_usage.prompt_tokens
                            or estimated_active_context_tokens
                        ),
                    )
        if not usage_received:
            yield RunEvent(
                type="usage",
                model=resolved_model,
                active_context_tokens=estimated_active_context_tokens,
            )
        yield RunEvent(
            type="completed",
            model=resolved_model,
        )

    async def complete_agent_turn(
        self,
        settings: ModelConnectionSettings,
        messages: list[dict[str, Any]],
        tools: tuple[dict[str, Any], ...],
        reasoning_effort: str | None,
    ) -> ProviderTurn:
        request_body: dict[str, Any] = {
            "model": settings.model,
            "messages": messages,
            "tools": list(tools),
            "tool_choice": "auto",
            "stream": False,
        }
        if settings.max_output_tokens is not None:
            request_body["max_tokens"] = settings.max_output_tokens
        if reasoning_effort:
            request_body["reasoning"] = {"effort": reasoning_effort}
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{settings.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.api_key}",
                    "Content-Type": "application/json",
                },
                json=request_body,
            )
            response.raise_for_status()
            payload = response.json()
        try:
            message = payload["choices"][0]["message"]
        except (KeyError, IndexError, TypeError) as error:
            raise ValueError("模型响应缺少消息") from error
        raw_calls = message.get("tool_calls") or []
        calls = tuple(
            ProviderToolCall(
                call_id=str(call.get("id") or uuid.uuid4()),
                name=str((call.get("function") or {}).get("name") or ""),
                arguments_json=str(
                    (call.get("function") or {}).get("arguments") or "{}"
                ),
            )
            for call in raw_calls
            if isinstance(call, dict)
        )
        return ProviderTurn(
            content=str(message.get("content") or ""),
            reasoning=str(
                message.get("reasoning_content")
                or message.get("reasoning")
                or ""
            ),
            model=str(payload.get("model") or settings.model),
            usage=self._parse_usage(payload.get("usage") or {}),
            tool_calls=calls,
        )

    async def stream_agent_turn(
        self,
        settings: ModelConnectionSettings,
        messages: list[dict[str, Any]],
        tools: tuple[dict[str, Any], ...],
        reasoning_effort: str | None,
    ) -> AsyncIterator[ProviderTurnEvent]:
        request_body: dict[str, Any] = {
            "model": settings.model,
            "messages": messages,
            "tools": list(tools),
            "tool_choice": "auto",
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        if settings.max_output_tokens is not None:
            request_body["max_tokens"] = settings.max_output_tokens
        if reasoning_effort:
            request_body["reasoning"] = {"effort": reasoning_effort}

        resolved_model = settings.model
        content_parts: list[str] = []
        reasoning_parts: list[str] = []
        usage = TokenUsageResponse(
            promptTokens=0,
            completionTokens=0,
            totalTokens=0,
        )
        call_parts: dict[int, dict[str, str]] = {}

        estimator = TokenEstimator()
        estimated_prompt_tokens = (
            estimator.estimate_messages(request_body["messages"])
            + estimator.estimate_tools(tuple(request_body.get("tools", [])))
        )
        streamed_output_bytes = 0
        streamed_reasoning_bytes = 0
        last_emitted_output_tokens = -1
        stream_started = False
        authoritative_usage_received = False

        def provisional_usage_event(
            *,
            force: bool = False,
        ) -> ProviderTurnEvent | None:
            nonlocal last_emitted_output_tokens
            if not stream_started or authoritative_usage_received:
                return None
            snapshot = estimate_stream_usage(
                prompt_tokens=estimated_prompt_tokens,
                output_bytes=streamed_output_bytes,
                reasoning_bytes=streamed_reasoning_bytes,
            )
            if snapshot.completion_tokens == last_emitted_output_tokens:
                return None
            if (
                not force
                and last_emitted_output_tokens >= 0
                and snapshot.completion_tokens
                < last_emitted_output_tokens
                + self._PARTIAL_USAGE_EMIT_INTERVAL
            ):
                return None
            last_emitted_output_tokens = snapshot.completion_tokens
            return ProviderTurnEvent(
                type="usage",
                model=resolved_model,
                usage=snapshot,
                usage_estimated=True,
            )

        async with httpx.AsyncClient(timeout=120.0) as client, client.stream(
            "POST",
            f"{settings.base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.api_key}",
                "Content-Type": "application/json",
            },
            json=request_body,
        ) as response:
            response.raise_for_status()
            stream_started = True
            initial_usage = provisional_usage_event(force=True)
            if initial_usage is not None:
                yield initial_usage
            lines = response.aiter_lines()
            while True:
                try:
                    line = await anext(lines)
                except StopAsyncIteration:
                    break
                except Exception:
                    interrupted_usage = provisional_usage_event(force=True)
                    if interrupted_usage is not None:
                        yield interrupted_usage
                    raise
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                if not data:
                    continue
                payload = json.loads(data)
                resolved_model = str(payload.get("model") or resolved_model)
                raw_usage = payload.get("usage")
                if _has_chat_usage(raw_usage):
                    usage = self._parse_usage(raw_usage)
                    authoritative_usage_received = True
                    last_emitted_output_tokens = usage.completion_tokens
                    yield ProviderTurnEvent(
                        type="usage",
                        model=resolved_model,
                        usage=usage,
                        usage_estimated=False,
                    )
                choices = payload.get("choices") or []
                if not choices:
                    continue
                delta = choices[0].get("delta") or {}
                reasoning = (
                    delta.get("reasoning_content") or delta.get("reasoning")
                )
                if isinstance(reasoning, str) and reasoning:
                    reasoning_parts.append(reasoning)
                    reasoning_bytes = len(reasoning.encode("utf-8"))
                    streamed_reasoning_bytes += reasoning_bytes
                    streamed_output_bytes += reasoning_bytes
                    partial_usage = provisional_usage_event()
                    if partial_usage is not None:
                        yield partial_usage
                    yield ProviderTurnEvent(
                        type="reasoning_delta",
                        delta=reasoning,
                        model=resolved_model,
                    )
                content = delta.get("content")
                if isinstance(content, str) and content:
                    content_parts.append(content)
                    streamed_output_bytes += len(content.encode("utf-8"))
                    partial_usage = provisional_usage_event()
                    if partial_usage is not None:
                        yield partial_usage
                    yield ProviderTurnEvent(
                        type="content_delta",
                        delta=content,
                        model=resolved_model,
                    )
                for raw_call in delta.get("tool_calls") or []:
                    if not isinstance(raw_call, dict):
                        continue
                    index = int(raw_call.get("index") or 0)
                    current = call_parts.setdefault(
                        index,
                        {"id": "", "name": "", "arguments": ""},
                    )
                    generated_parts: list[str] = []
                    if raw_call.get("id"):
                        call_id = str(raw_call["id"])
                        current["id"] = call_id
                        generated_parts.append(call_id)
                    function = raw_call.get("function") or {}
                    if function.get("name"):
                        name = str(function["name"])
                        current["name"] += name
                        generated_parts.append(name)
                    if function.get("arguments"):
                        arguments = str(function["arguments"])
                        current["arguments"] += arguments
                        generated_parts.append(arguments)
                    streamed_output_bytes += sum(
                        len(part.encode("utf-8")) for part in generated_parts
                    )
                    partial_usage = provisional_usage_event()
                    if partial_usage is not None:
                        yield partial_usage
                    yield ProviderTurnEvent(
                        type="tool_call_delta",
                        model=resolved_model,
                    )

        if not authoritative_usage_received:
            final_estimate = provisional_usage_event(force=True)
            if final_estimate is not None:
                yield final_estimate
            usage = estimate_stream_usage(
                prompt_tokens=estimated_prompt_tokens,
                output_bytes=streamed_output_bytes,
                reasoning_bytes=streamed_reasoning_bytes,
            )

        calls = tuple(
            ProviderToolCall(
                call_id=part["id"] or str(uuid.uuid4()),
                name=part["name"],
                arguments_json=part["arguments"] or "{}",
            )
            for _, part in sorted(call_parts.items())
        )
        yield ProviderTurnEvent(
            type="completed",
            model=resolved_model,
            turn=ProviderTurn(
                content="".join(content_parts),
                reasoning="".join(reasoning_parts),
                model=resolved_model,
                usage=usage,
                tool_calls=calls,
            ),
        )

    def _request_body(
        self,
        settings: ModelConnectionSettings,
        prompt: PromptAssembly,
        messages: list[ChatMessageRequest],
        stream: bool,
        reasoning_effort: str | None = None,
    ) -> dict[str, Any]:
        request_messages: list[dict[str, Any]] = [
            *prompt.system_messages,
            *prompt.context_messages,
            *[
                {"role": message.role, "content": message.content}
                for message in messages
            ],
        ]
        request_body: dict[str, Any] = {
            "model": settings.model,
            "messages": request_messages,
            "stream": stream,
        }
        if prompt.tools:
            request_body["tools"] = list(prompt.tools)
        if settings.max_output_tokens is not None:
            request_body["max_tokens"] = settings.max_output_tokens
        if stream:
            request_body["stream_options"] = {"include_usage": True}
        if reasoning_effort:
            request_body["reasoning"] = {"effort": reasoning_effort}
        return request_body

    @staticmethod
    def _parse_response(
        payload: dict[str, Any],
        fallback_model: str,
    ) -> ChatCompletionResponse:
        try:
            content = payload["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as error:
            raise ValueError("模型响应缺少消息内容") from error
        if not isinstance(content, str) or not content.strip():
            raise ValueError("模型返回了空消息")

        usage = payload.get("usage") or {}
        return ChatCompletionResponse(
            message=content.strip(),
            model=str(payload.get("model") or fallback_model),
            usage=OpenAICompatibleProvider._parse_usage(usage),
        )

    @staticmethod
    def _parse_usage(usage: dict[str, Any]) -> TokenUsageResponse:
        return parse_chat_usage(usage)


def _has_chat_usage(value: Any) -> bool:
    return isinstance(value, dict) and any(
        key in value
        for key in (
            "prompt_tokens",
            "completion_tokens",
            "total_tokens",
            "prompt_cache_hit_tokens",
            "prompt_cache_miss_tokens",
        )
    )
