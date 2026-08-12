from collections.abc import AsyncIterator
from typing import Any

from app.dto.request.chat_completion_request import ChatMessageRequest
from app.dto.response.chat_completion_response import ChatCompletionResponse
from app.harness.contracts import ProviderTurn, ProviderTurnEvent
from app.harness.ports.model_provider import ModelProviderPort
from app.harness.run_event import RunEvent
from app.model.model_connection_settings import ModelConnectionSettings
from app.prompt.prompt_assembly import PromptAssembly
from app.provider.anthropic_provider import AnthropicProvider
from app.provider.openai_compatible_provider import OpenAICompatibleProvider
from app.provider.responses_provider import ResponsesProvider


class RoutingModelProvider:
    """Selects a wire-protocol adapter from the connection's apiFormat."""

    def __init__(
        self,
        adapters: dict[str, ModelProviderPort] | None = None,
    ) -> None:
        self._adapters = adapters or {
            "chat-completions": OpenAICompatibleProvider(),
            "responses": ResponsesProvider(),
            "anthropic": AnthropicProvider(),
        }

    def _adapter(self, settings: ModelConnectionSettings) -> ModelProviderPort:
        api_format = settings.api_format.strip().lower()
        try:
            return self._adapters[api_format]
        except KeyError as error:
            raise ValueError(f"不支持的模型 API 格式: {api_format}") from error

    async def list_models(self, settings: ModelConnectionSettings) -> list[str]:
        return await self._adapter(settings).list_models(settings)

    async def complete(
        self,
        settings: ModelConnectionSettings,
        prompt: PromptAssembly,
        messages: list[ChatMessageRequest],
        reasoning_effort: str | None = None,
    ) -> ChatCompletionResponse:
        return await self._adapter(settings).complete(
            settings, prompt, messages, reasoning_effort
        )

    def stream(
        self,
        settings: ModelConnectionSettings,
        prompt: PromptAssembly,
        messages: list[ChatMessageRequest],
        reasoning_effort: str | None = None,
    ) -> AsyncIterator[RunEvent]:
        return self._adapter(settings).stream(
            settings, prompt, messages, reasoning_effort
        )

    async def compact_context(
        self,
        settings: ModelConnectionSettings,
        messages: list[ChatMessageRequest],
        existing_summary: str | None = None,
    ) -> ChatCompletionResponse:
        return await self._adapter(settings).compact_context(
            settings, messages, existing_summary
        )

    async def complete_agent_turn(
        self,
        settings: ModelConnectionSettings,
        messages: list[dict[str, Any]],
        tools: tuple[dict[str, Any], ...],
        reasoning_effort: str | None,
    ) -> ProviderTurn:
        return await self._adapter(settings).complete_agent_turn(
            settings, messages, tools, reasoning_effort
        )

    def stream_agent_turn(
        self,
        settings: ModelConnectionSettings,
        messages: list[dict[str, Any]],
        tools: tuple[dict[str, Any], ...],
        reasoning_effort: str | None,
    ) -> AsyncIterator[ProviderTurnEvent]:
        return self._adapter(settings).stream_agent_turn(
            settings, messages, tools, reasoning_effort
        )

    async def compact_agent_history(
        self,
        settings: ModelConnectionSettings,
        messages: list[dict[str, Any]],
        existing_summary: str | None = None,
    ) -> ChatCompletionResponse:
        return await self._adapter(settings).compact_agent_history(
            settings, messages, existing_summary
        )
