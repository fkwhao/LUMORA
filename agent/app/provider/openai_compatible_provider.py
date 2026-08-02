import json
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


class OpenAICompatibleProvider:
    """调用实现 OpenAI Chat Completions 契约的第三方模型服务。"""

    async def complete(
        self,
        settings: ModelConnectionSettings,
        system_prompt: str,
        messages: list[ChatMessageRequest],
    ) -> ChatCompletionResponse:
        request_body = self._request_body(
            settings,
            system_prompt,
            messages,
            stream=False,
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
        system_prompt: str,
        messages: list[ChatMessageRequest],
    ) -> AsyncIterator[ChatStreamEventResponse]:
        request_body = self._request_body(
            settings,
            system_prompt,
            messages,
            stream=True,
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

    def _request_body(
        self,
        settings: ModelConnectionSettings,
        system_prompt: str,
        messages: list[ChatMessageRequest],
        stream: bool,
    ) -> dict[str, Any]:
        request_body: dict[str, Any] = {
            "model": settings.model,
            "messages": [
                {
                    "role": "system",
                    "content": system_prompt,
                },
                *[
                    {"role": message.role, "content": message.content}
                    for message in messages
                ],
            ],
            "stream": stream,
        }
        if stream:
            request_body["stream_options"] = {"include_usage": True}
        if self._is_deepseek(settings):
            # DeepSeek 的思考模型需要显式开启，返回内容位于 reasoning_content。
            request_body["reasoning_effort"] = "high"
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
