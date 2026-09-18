from collections.abc import AsyncIterator
from typing import Any, Protocol, runtime_checkable

from app.dto.request.chat_completion_request import ChatMessageRequest
from app.dto.response.chat_completion_response import ChatCompletionResponse
from app.harness.contracts import ProviderTurn, ProviderTurnEvent
from app.harness.run_event import RunEvent
from app.model.model_connection_settings import ModelConnectionSettings
from app.prompt.prompt_assembly import PromptAssembly


@runtime_checkable
class CompletionProviderPort(Protocol):
    """面向普通文本完成和上下文压缩的最小 Provider 接口。"""

    async def complete(
        self,
        settings: ModelConnectionSettings,
        prompt: PromptAssembly,
        messages: list[ChatMessageRequest],
        reasoning_effort: str | None = None,
    ) -> ChatCompletionResponse: ...


@runtime_checkable
class AgentTurnProviderPort(Protocol):
    """面向 Agent 回合的 Provider 接口，保留工具调用和流式事件。"""

    def stream_agent_turn(
        self,
        settings: ModelConnectionSettings,
        messages: list[dict[str, Any]],
        tools: tuple[dict[str, Any], ...],
        reasoning_effort: str | None,
    ) -> AsyncIterator[ProviderTurnEvent]: ...

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
    """Agent Runtime 使用的完整模型 Provider 接口。

    ChatService 和 AgentHarness 依赖这个协议，而不依赖某个具体厂商适配器。
    """

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
