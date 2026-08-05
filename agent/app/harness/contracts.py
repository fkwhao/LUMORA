from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

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


TurnCompleter = Callable[
    [ModelConnectionSettings, list[dict[str, Any]], tuple[dict[str, Any], ...], str | None],
    Awaitable[ProviderTurn],
]
HistoryCompactor = Callable[
    [ModelConnectionSettings, list[dict[str, Any]], str | None],
    Awaitable[ChatCompletionResponse],
]
PromptSupplier = Callable[[str | None], PromptAssembly]
