from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Literal

from app.context.usage import ContextUsageSnapshot
from app.dto.response.chat_completion_response import (
    ChatCompletionResponse,
    TokenUsageResponse,
)
from app.model.model_connection_settings import ModelConnectionSettings
from app.prompt.prompt_assembly import PromptAssembly


@dataclass(frozen=True, slots=True)
class ProviderWebSource:
    title: str
    url: str


@dataclass(frozen=True, slots=True)
class ProviderToolCall:
    call_id: str
    name: str
    arguments_json: str


@dataclass(frozen=True, slots=True)
class ProviderTurn:
    content: str
    reasoning: str
    model: str
    usage: TokenUsageResponse
    tool_calls: tuple[ProviderToolCall, ...]
    provider_state: dict[str, Any] | None = None
    context_usage: ContextUsageSnapshot | None = None

    def context_snapshot(self, fallback_tokens: int = 0) -> ContextUsageSnapshot:
        if self.context_usage is not None:
            return self.context_usage if self.context_usage.tokens > 0 else (
                ContextUsageSnapshot(fallback_tokens)
            )
        return ContextUsageSnapshot(
            self.usage.prompt_tokens or fallback_tokens,
            estimated=self.usage.prompt_tokens <= 0,
        )


@dataclass(frozen=True, slots=True)
class ProviderTurnEvent:
    type: Literal[
        "content_delta",
        "content_reset",
        "stage_content",
        "reasoning_delta",
        "tool_call_delta",
        "web_search_started",
        "web_search_progress",
        "web_search_completed",
        "web_search_failed",
        "usage",
        "completed",
    ]
    delta: str = ""
    model: str = ""
    item_id: str = ""
    query: str = ""
    sources: tuple[ProviderWebSource, ...] = ()
    error_message: str = ""
    turn: ProviderTurn | None = None
    usage: TokenUsageResponse | None = None
    usage_estimated: bool = False


TurnCompleter = Callable[
    [ModelConnectionSettings, list[dict[str, Any]], tuple[dict[str, Any], ...], str | None],
    Awaitable[ProviderTurn],
]
TurnStreamer = Callable[
    [ModelConnectionSettings, list[dict[str, Any]], tuple[dict[str, Any], ...], str | None],
    AsyncIterator[ProviderTurnEvent],
]
HistoryCompactor = Callable[
    [ModelConnectionSettings, list[dict[str, Any]], str | None],
    Awaitable[ChatCompletionResponse],
]
PromptSupplier = Callable[[str | None], PromptAssembly]
