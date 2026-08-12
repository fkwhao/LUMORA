import json
import uuid
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import replace
from typing import Any

from app.context.estimator import TokenEstimator
from app.context.planner import summary_output_tokens
from app.dto.request.chat_completion_request import ChatMessageRequest
from app.dto.response.chat_completion_response import ChatCompletionResponse
from app.harness.contracts import ProviderTurn, ProviderTurnEvent
from app.harness.provider_event_mapper import (
    is_web_search_event,
    web_search_run_event,
)
from app.harness.run_event import RunEvent, RunUsage
from app.model.model_connection_settings import ModelConnectionSettings
from app.prompt.prompt_assembly import PromptAssembly
from app.prompt.prompt_loader import PromptLoader


class ProtocolProviderBase(ABC):
    """Protocol-neutral completion, streaming, and compaction behavior."""

    def __init__(self, prompt_loader: PromptLoader | None = None) -> None:
        self._prompt_loader = prompt_loader or PromptLoader()

    @abstractmethod
    async def complete_agent_turn(
        self,
        settings: ModelConnectionSettings,
        messages: list[dict[str, Any]],
        tools: tuple[dict[str, Any], ...],
        reasoning_effort: str | None,
    ) -> ProviderTurn: ...

    @abstractmethod
    def stream_agent_turn(
        self,
        settings: ModelConnectionSettings,
        messages: list[dict[str, Any]],
        tools: tuple[dict[str, Any], ...],
        reasoning_effort: str | None,
    ) -> AsyncIterator[ProviderTurnEvent]: ...

    async def complete(
        self,
        settings: ModelConnectionSettings,
        prompt: PromptAssembly,
        messages: list[ChatMessageRequest],
        reasoning_effort: str | None = None,
    ) -> ChatCompletionResponse:
        turn = await self.complete_agent_turn(
            replace(settings, web_search_enabled=False),
            _prompt_messages(prompt, messages),
            prompt.tools,
            reasoning_effort,
        )
        if turn.tool_calls or not turn.content.strip():
            raise ValueError("模型响应缺少最终文本")
        return ChatCompletionResponse(
            message=turn.content.strip(),
            model=turn.model,
            usage=turn.usage,
        )

    async def compact_context(
        self,
        settings: ModelConnectionSettings,
        messages: list[ChatMessageRequest],
        existing_summary: str | None = None,
    ) -> ChatCompletionResponse:
        source_messages: list[dict[str, Any]] = []
        if existing_summary:
            source_messages.append({
                "role": "user",
                "content": "已有的早期对话摘要：\n" + existing_summary,
            })
        source_messages.extend(
            {"role": message.role, "content": message.content}
            for message in messages
        )
        source_messages.append({
            "role": "user",
            "content": self._prompt_loader.load_specialized(
                "context_compaction_request"
            ),
        })
        turn = await self.complete_agent_turn(
            _compaction_settings(settings),
            [
                {
                    "role": "system",
                    "content": self._prompt_loader.load_specialized(
                        "context_compaction_system"
                    ),
                },
                *source_messages,
            ],
            (),
            None,
        )
        return _completion_response(turn)

    async def compact_agent_history(
        self,
        settings: ModelConnectionSettings,
        messages: list[dict[str, Any]],
        existing_summary: str | None = None,
    ) -> ChatCompletionResponse:
        source = []
        if existing_summary:
            source.append("已有上下文摘要：\n" + existing_summary)
        source.append(
            "待压缩的模型可见历史（JSON）：\n"
            + json.dumps(messages, ensure_ascii=False, separators=(",", ":"))
        )
        turn = await self.complete_agent_turn(
            _compaction_settings(settings),
            [
                {
                    "role": "system",
                    "content": self._prompt_loader.load_specialized(
                        "agent_history_compaction"
                    ),
                },
                {"role": "user", "content": "\n\n".join(source)},
            ],
            (),
            None,
        )
        return _completion_response(turn)

    async def stream(
        self,
        settings: ModelConnectionSettings,
        prompt: PromptAssembly,
        messages: list[ChatMessageRequest],
        reasoning_effort: str | None = None,
    ) -> AsyncIterator[RunEvent]:
        request_messages = _prompt_messages(prompt, messages)
        estimator = TokenEstimator()
        estimated_context = estimator.estimate_messages(request_messages)
        estimated_context += estimator.estimate_tools(prompt.tools)
        completed_turn = None
        async for event in self.stream_agent_turn(
            settings,
            request_messages,
            prompt.tools,
            reasoning_effort,
        ):
            if event.type == "content_delta":
                yield RunEvent(
                    type="text_delta",
                    delta=event.delta,
                    model=event.model,
                )
            elif event.type in {"content_reset", "stage_content"}:
                if event.type == "stage_content" and event.delta.strip():
                    yield RunEvent(
                        type="progress_message",
                        item_id=event.item_id or str(uuid.uuid4()),
                        delta=event.delta.strip(),
                        model=event.model,
                    )
                yield RunEvent(
                    type="text_reset",
                    model=event.model,
                )
            elif event.type == "reasoning_delta":
                yield RunEvent(
                    type="reasoning_delta",
                    delta=event.delta,
                    model=event.model,
                )
            elif is_web_search_event(event):
                yield web_search_run_event(event)
            elif event.type == "completed":
                completed_turn = event.turn
        if completed_turn is None:
            raise ValueError("模型流未返回完整回合")
        yield RunEvent(
            type="usage",
            model=completed_turn.model,
            usage=RunUsage(
                prompt_tokens=completed_turn.usage.prompt_tokens,
                completion_tokens=completed_turn.usage.completion_tokens,
                total_tokens=completed_turn.usage.total_tokens,
                input_tokens=completed_turn.usage.input_tokens,
                output_tokens=completed_turn.usage.output_tokens,
                reasoning_tokens=completed_turn.usage.reasoning_tokens,
                cache_read_tokens=completed_turn.usage.cache_read_tokens,
                cache_write_tokens=completed_turn.usage.cache_write_tokens,
                cache_metrics_available=(
                    completed_turn.usage.cache_metrics_available
                ),
            ),
            active_context_tokens=(
                completed_turn.usage.prompt_tokens or estimated_context
            ),
        )
        yield RunEvent(type="completed", model=completed_turn.model)


def _prompt_messages(
    prompt: PromptAssembly,
    messages: list[ChatMessageRequest],
) -> list[dict[str, Any]]:
    return [
        *prompt.system_messages,
        *prompt.context_messages,
        *(
            {"role": message.role, "content": message.content}
            for message in messages
        ),
    ]


def _compaction_settings(
    settings: ModelConnectionSettings,
) -> ModelConnectionSettings:
    return replace(
        settings,
        max_output_tokens=summary_output_tokens(settings),
        web_search_enabled=False,
    )


def _completion_response(turn: ProviderTurn) -> ChatCompletionResponse:
    if turn.tool_calls or not turn.content.strip():
        raise ValueError("上下文压缩响应缺少最终文本")
    return ChatCompletionResponse(
        message=turn.content.strip(),
        model=turn.model,
        usage=turn.usage,
    )
