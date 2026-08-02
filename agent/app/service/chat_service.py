from collections.abc import AsyncIterator

import httpx

from app.dto.request.chat_completion_request import ChatCompletionRequest
from app.dto.response.chat_completion_response import ChatCompletionResponse
from app.dto.response.chat_stream_event_response import (
    ChatStreamEventResponse,
)
from app.model.model_connection_settings import ModelConnectionSettings
from app.prompt.prompt_builder import PromptBuilder
from app.provider.openai_compatible_provider import OpenAICompatibleProvider


class ModelProviderError(RuntimeError):
    pass


class ChatService:
    def __init__(
        self,
        provider: OpenAICompatibleProvider,
        prompt_builder: PromptBuilder,
    ) -> None:
        self._provider = provider
        self._prompt_builder = prompt_builder

    async def complete(
        self,
        request: ChatCompletionRequest,
    ) -> ChatCompletionResponse:
        settings = self._connection(request)
        system_prompt = self._prompt_builder.build()
        try:
            return await self._provider.complete(
                settings,
                system_prompt,
                request.messages,
            )
        except (httpx.HTTPError, ValueError) as error:
            # Provider 响应可能包含敏感内容，HTTP 边界只返回稳定错误。
            raise ModelProviderError(
                "模型 API 调用失败，请检查地址、Key 和模型名称"
            ) from error

    async def stream(
        self,
        request: ChatCompletionRequest,
    ) -> AsyncIterator[ChatStreamEventResponse]:
        try:
            settings = self._connection(request)
            system_prompt = self._prompt_builder.build()
            async for event in self._provider.stream(
                settings,
                system_prompt,
                request.messages,
            ):
                yield event
        except (httpx.HTTPError, ValueError) as error:
            raise ModelProviderError(
                "模型 API 流式调用失败，请检查地址、Key 和模型名称"
            ) from error

    @staticmethod
    def _connection(
        request: ChatCompletionRequest,
    ) -> ModelConnectionSettings:
        """将 Java 提供的连接参数转为瞬时配置，不在 Python 侧落盘。"""
        connection = request.connection
        settings = ModelConnectionSettings(
            provider_name=connection.provider_name,
            base_url=connection.base_url,
            model=connection.model,
            api_key=connection.api_key,
        )
        settings.validate()
        return settings
