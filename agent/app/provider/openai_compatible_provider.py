import json
import uuid
from collections.abc import AsyncIterator
from typing import Any

import httpx

from app.dto.request.chat_completion_request import ChatMessageRequest
from app.dto.response.chat_completion_response import (
    ChatCompletionResponse,
    TokenUsageResponse,
)
from app.dto.response.chat_stream_event_response import (
    ChatStreamEventResponse,
)
from app.model.model_connection_settings import ModelConnectionSettings
from app.prompt.prompt_assembly import PromptAssembly
from app.provider.agent_loop import (
    AgentLoopRunner,
    ProviderToolCall,
    ProviderTurn,
)
from app.tool.base import ToolContext
from app.tool.registry import ToolRegistry


class OpenAICompatibleProvider:
    """调用实现 OpenAI Chat Completions 契约的第三方模型服务。"""

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

    async def stream(
        self,
        settings: ModelConnectionSettings,
        prompt: PromptAssembly,
        messages: list[ChatMessageRequest],
        reasoning_effort: str | None = None,
    ) -> AsyncIterator[ChatStreamEventResponse]:
        request_body = self._request_body(
            settings,
            prompt,
            messages,
            stream=True,
            reasoning_effort=reasoning_effort,
        )
        resolved_model = settings.model
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
                if not data or data == "[DONE]":
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
                        yield ChatStreamEventResponse(
                            type="reasoning_delta",
                            delta=reasoning,
                            model=resolved_model,
                        )
                    content = delta.get("content")
                    if isinstance(content, str) and content:
                        yield ChatStreamEventResponse(
                            type="text_delta",
                            delta=content,
                            model=resolved_model,
                        )
                usage = payload.get("usage")
                if isinstance(usage, dict):
                    yield ChatStreamEventResponse(
                        type="usage",
                        model=resolved_model,
                        usage=self._parse_usage(usage),
                    )
        yield ChatStreamEventResponse(
            type="completed",
            model=resolved_model,
        )

    async def agent_stream(
        self,
        settings: ModelConnectionSettings,
        prompt: PromptAssembly,
        messages: list[ChatMessageRequest],
        reasoning_effort: str | None,
        registry: ToolRegistry,
        tool_context: ToolContext,
    ) -> AsyncIterator[ChatStreamEventResponse]:
        """执行最多二十轮的模型工具循环，并输出可验证的工作过程事件。"""
        async for event in AgentLoopRunner(self._complete_agent_turn).stream(
            settings,
            prompt,
            messages,
            reasoning_effort,
            registry,
            tool_context,
        ):
            yield event

    async def _complete_agent_turn(
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
        if reasoning_effort:
            request_body["reasoning_effort"] = reasoning_effort
        if self._is_deepseek(settings):
            request_body["reasoning_effort"] = reasoning_effort or "high"
            request_body["thinking"] = {"type": "enabled"}
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
        if stream:
            request_body["stream_options"] = {"include_usage": True}
        if reasoning_effort:
            request_body["reasoning_effort"] = reasoning_effort
        if self._is_deepseek(settings):
            # DeepSeek 的思考模型需要显式开启，返回内容位于 reasoning_content。
            request_body["reasoning_effort"] = reasoning_effort or "high"
            request_body["thinking"] = {"type": "enabled"}
        return request_body

    @staticmethod
    def _is_deepseek(settings: ModelConnectionSettings) -> bool:
        identity = (
            f"{settings.provider_name} "
            f"{settings.base_url} "
            f"{settings.model}"
        ).lower()
        return "deepseek" in identity

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
        return TokenUsageResponse(
            promptTokens=int(usage.get("prompt_tokens") or 0),
            completionTokens=int(usage.get("completion_tokens") or 0),
            totalTokens=int(usage.get("total_tokens") or 0),
        )
