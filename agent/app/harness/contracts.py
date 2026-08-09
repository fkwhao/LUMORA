from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Literal

from app.dto.response.chat_completion_response import (
    ChatCompletionResponse,
    TokenUsageResponse,
)
from app.model.model_connection_settings import ModelConnectionSettings
from app.prompt.prompt_assembly import PromptAssembly


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


@dataclass(frozen=True, slots=True)
class ProviderTurnEvent:
    type: Literal[
        "content_delta",
        "reasoning_delta",
        "tool_call_delta",
        "completed",
    ]
    delta: str = ""
    model: str = ""
    turn: ProviderTurn | None = None


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
