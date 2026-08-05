from collections.abc import AsyncIterator
from typing import Any, Protocol, runtime_checkable

from app.dto.request.chat_completion_request import ChatMessageRequest
from app.dto.response.chat_completion_response import ChatCompletionResponse
from app.harness.contracts import ProviderTurn
from app.harness.run_event import RunEvent
from app.model.model_connection_settings import ModelConnectionSettings
from app.prompt.prompt_assembly import PromptAssembly


@runtime_checkable
class CompletionProviderPort(Protocol):
    async def complete(
        self,
        settings: ModelConnectionSettings,
        prompt: PromptAssembly,
        messages: list[ChatMessageRequest],
        reasoning_effort: str | None = None,
    ) -> ChatCompletionResponse: ...


@runtime_checkable
class AgentTurnProviderPort(Protocol):
    async def complete_agent_turn(
        self,
        settings: ModelConnectionSettings,
        messages: list[dict[str, Any]],
        tools: tuple[dict[str, Any], ...],
        reasoning_effort: str | None,
    ) -> ProviderTurn: ...

    async def compact_agent_history(
        self,
        settings: ModelConnectionSettings,
        messages: list[dict[str, Any]],
        existing_summary: str | None = None,
    ) -> ChatCompletionResponse: ...


@runtime_checkable
class ModelProviderPort(
    CompletionProviderPort,
    AgentTurnProviderPort,
    Protocol,
):
    async def list_models(
        self,
        settings: ModelConnectionSettings,
    ) -> list[str]: ...

    def stream(
        self,
        settings: ModelConnectionSettings,
        prompt: PromptAssembly,
        messages: list[ChatMessageRequest],
        reasoning_effort: str | None = None,
    ) -> AsyncIterator[RunEvent]: ...

    async def compact_context(
        self,
        settings: ModelConnectionSettings,
        messages: list[ChatMessageRequest],
        existing_summary: str | None = None,
    ) -> ChatCompletionResponse: ...
