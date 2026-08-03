from collections.abc import AsyncIterator

import httpx

from app.dto.request.chat_completion_request import ChatCompletionRequest
from app.dto.request.model_list_request import ModelListRequest
from app.dto.response.chat_completion_response import ChatCompletionResponse
from app.dto.response.chat_stream_event_response import (
    ChatStreamEventResponse,
)
from app.model.model_connection_settings import ModelConnectionSettings
from app.prompt.prompt_builder import PromptBuilder
from app.prompt.prompt_context import PromptContext
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

    async def list_models(self, request: ModelListRequest) -> list[str]:
        connection = request
        settings = ModelConnectionSettings(
            provider_name=connection.provider_name,
            base_url=connection.base_url,
            model="_model_discovery",
            api_key=connection.api_key,
        )
        settings.validate()
        try:
            return await self._provider.list_models(settings)
        except (httpx.HTTPError, ValueError) as error:
            raise ModelProviderError(
                "获取模型列表失败，请检查地址和 API Key"
            ) from error

    async def complete(
        self,
        request: ChatCompletionRequest,
    ) -> ChatCompletionResponse:
        settings = self._connection(request)
        prompt = self._prompt_builder.build(self._prompt_context(request))
        try:
            return await self._provider.complete(
                settings,
                prompt,
                request.messages,
                request.reasoning_effort,
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
            prompt = self._prompt_builder.build(self._prompt_context(request))
            async for event in self._provider.stream(
                settings,
                prompt,
                request.messages,
                request.reasoning_effort,
            ):
                yield event
        except (httpx.HTTPError, ValueError) as error:
            raise ModelProviderError(
                "模型 API 流式调用失败，请检查地址、Key 和模型名称"
            ) from error

    @staticmethod
    def _prompt_context(request: ChatCompletionRequest) -> PromptContext:
        context = request.prompt_context
        return PromptContext(
            response_language=context.response_language,
            workspace_path=context.workspace_path,
            project_instructions=tuple(context.project_instructions),
            available_tools=tuple(context.available_tools),
            tool_definitions=tuple(context.tool_definitions),
            memory_summary=context.memory_summary,
            system_reminders=tuple(context.system_reminders),
        )

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
