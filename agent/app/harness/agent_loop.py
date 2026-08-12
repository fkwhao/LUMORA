import uuid
from collections.abc import AsyncIterator
from typing import Any

from app.context.estimator import TokenEstimator
from app.context.planner import ContextPlanner
from app.dto.request.chat_completion_request import ChatMessageRequest
from app.dto.response.chat_completion_response import TokenUsageResponse
from app.execution.tool_call_executor import ToolCallExecutor
from app.execution.tool_result_processor import ToolResultProcessor
from app.harness.contracts import (
    HistoryCompactor,
    PromptSupplier,
    TurnCompleter,
    TurnStreamer,
)
from app.harness.provider_event_mapper import (
    is_web_search_event,
    web_search_run_event,
)
from app.harness.run_event import RunEvent, RunUsage
from app.model.model_connection_settings import ModelConnectionSettings
from app.permission.broker import ApprovalBroker
from app.permission.config_store import PermissionConfigStore
from app.permission.engine import PermissionEngine
from app.permission.model import PermissionPolicy
from app.permission.reviewer import ApprovalReviewer, ModelApprovalReviewer
from app.prompt.prompt_assembly import PromptAssembly
from app.provider.token_usage import add_token_usage, empty_token_usage
from app.tool.base import ToolContext
from app.tool.registry import ToolRegistry


class AgentLoopRunner:
    """编排模型回合、工具执行和公开工作事件。"""

    _FINAL_STREAM_CLASSIFICATION_CHARS = 32
    _VISIBLE_DELTA_CHARS = 8

    def __init__(
        self,
        complete_turn: TurnCompleter,
        compact_history: HistoryCompactor | None = None,
        prompt_supplier: PromptSupplier | None = None,
        context_planner: ContextPlanner | None = None,
        result_processor: ToolResultProcessor | None = None,
        stream_turn: TurnStreamer | None = None,
        approval_reviewer: ApprovalReviewer | None = None,
    ) -> None:
        self._complete_turn = complete_turn
        self._compact_history = compact_history
        self._prompt_supplier = prompt_supplier
        self._context_planner = context_planner or ContextPlanner()
        self._token_estimator = TokenEstimator()
        self._result_processor = result_processor or ToolResultProcessor()
        self._stream_turn = stream_turn
        self._approval_reviewer = (
            approval_reviewer
            if approval_reviewer is not None
            else ModelApprovalReviewer(complete_turn)
        )

    async def stream(
        self,
        settings: ModelConnectionSettings,
        prompt: PromptAssembly,
        messages: list[ChatMessageRequest],
        reasoning_effort: str | None,
        registry: ToolRegistry,
        tool_context: ToolContext,
        permission_policy: PermissionPolicy | None = None,
        permission_engine: PermissionEngine | None = None,
        approval_broker: ApprovalBroker | None = None,
        permission_config_store: PermissionConfigStore | None = None,
        conversation_summary: str | None = None,
    ) -> AsyncIterator[RunEvent]:
        permission_policy = permission_policy or PermissionPolicy()
        permission_engine = permission_engine or PermissionEngine()
        approval_broker = approval_broker or ApprovalBroker()
        permission_config_store = (
            permission_config_store or PermissionConfigStore()
        )
        request_messages: list[dict[str, Any]] = [
            *prompt.system_messages,
            *prompt.context_messages,
            *[
                {"role": message.role, "content": message.content}
                for message in messages
            ],
        ]
        cumulative_usage = empty_token_usage()
        active_context_tokens = 0
        resolved_model = settings.model
        active_summary = conversation_summary
        blocked_call_signatures: set[str] = set()
        tool_executor = ToolCallExecutor(
            registry,
            permission_engine,
            approval_broker,
            permission_config_store,
            self._result_processor,
            self._approval_reviewer,
            blocked_call_signatures,
        )

        for _iteration in range(20):
            content_was_streamed = False
            stage_content_seen = False
            if self._stream_turn is None:
                turn = await self._complete_turn(
                    settings,
                    request_messages,
                    prompt.tools,
                    reasoning_effort,
                )
            else:
                turn = None
                pending_content: list[str] = []
                pending_chars = 0
                visible_content: list[str] = []
                visible_chars = 0
                tool_call_seen = False
                async for turn_event in self._stream_turn(
                    settings,
                    request_messages,
                    prompt.tools,
                    reasoning_effort,
                ):
                    if turn_event.type == "reasoning_delta":
                        continue
                    elif is_web_search_event(turn_event):
                        yield web_search_run_event(turn_event)
                    elif turn_event.type == "tool_call_delta":
                        tool_call_seen = True
                    elif turn_event.type in {"content_reset", "stage_content"}:
                        if (
                            turn_event.type == "stage_content"
                            and turn_event.delta.strip()
                        ):
                            stage_content_seen = True
                            yield RunEvent(
                                type="progress_message",
                                item_id=turn_event.item_id or str(uuid.uuid4()),
                                delta=turn_event.delta.strip(),
                                model=turn_event.model or resolved_model,
                            )
                        pending_content.clear()
                        pending_chars = 0
                        visible_content.clear()
                        visible_chars = 0
                        if content_was_streamed:
                            yield RunEvent(
                                type="text_reset",
                                model=turn_event.model or resolved_model,
                            )
                        content_was_streamed = False
                    elif turn_event.type == "content_delta":
                        if content_was_streamed:
                            visible_content.append(turn_event.delta)
                            visible_chars += len(turn_event.delta)
                            if visible_chars >= self._VISIBLE_DELTA_CHARS:
                                yield RunEvent(
                                    type="text_delta",
                                    delta="".join(visible_content),
                                    model=turn_event.model or resolved_model,
                                )
                                visible_content.clear()
                                visible_chars = 0
                            continue
                        pending_content.append(turn_event.delta)
                        pending_chars += len(turn_event.delta)
                        if (
                            not tool_call_seen
                            and pending_chars
                            >= self._FINAL_STREAM_CLASSIFICATION_CHARS
                        ):
                            content_was_streamed = True
                            yield RunEvent(
                                type="text_delta",
                                delta="".join(pending_content),
                                model=turn_event.model or resolved_model,
                            )
                            pending_content.clear()
                    elif turn_event.type == "completed":
                        turn = turn_event.turn
                if turn is None:
                    raise ValueError("模型流未返回完整回合")
                if (
                    not turn.tool_calls
                    and not content_was_streamed
                    and pending_content
                ):
                    content_was_streamed = True
                    yield RunEvent(
                        type="text_delta",
                        delta="".join(pending_content),
                        model=turn.model,
                    )
                elif not turn.tool_calls and visible_content:
                    yield RunEvent(
                        type="text_delta",
                        delta="".join(visible_content),
                        model=turn.model,
                    )
            assert turn is not None
            resolved_model = turn.model
            cumulative_usage = add_token_usage((cumulative_usage, turn.usage))
            active_context_tokens = turn.usage.prompt_tokens or (
                self._token_estimator.estimate_messages(request_messages)
                + self._token_estimator.estimate_tools(prompt.tools)
            )
            if not turn.tool_calls:
                if not turn.content.strip():
                    raise ValueError("模型返回了空消息")
                if not content_was_streamed:
                    yield RunEvent(
                        type="text_delta", delta=turn.content, model=resolved_model
                    )
                yield RunEvent(
                    type="usage",
                    model=resolved_model,
                    usage=_to_run_usage(cumulative_usage),
                    active_context_tokens=active_context_tokens,
                )
                yield RunEvent(type="completed", model=resolved_model)
                return

            if (
                turn.content.strip()
                and not content_was_streamed
                and not stage_content_seen
            ):
                yield RunEvent(
                    type="progress_message",
                    item_id=str(uuid.uuid4()),
                    delta=turn.content.strip(),
                    model=resolved_model,
                )
            yield RunEvent(
                type="usage",
                model=resolved_model,
                usage=_to_run_usage(cumulative_usage),
                active_context_tokens=active_context_tokens,
            )
            request_messages.append({
                "role": "assistant",
                "content": turn.content or None,
                "tool_calls": [
                    {
                        "id": call.call_id,
                        "type": "function",
                        "function": {
                            "name": call.name,
                            "arguments": call.arguments_json,
                        },
                    }
                    for call in turn.tool_calls
                ],
            })
            inline_result_chars = 0
            pending_tool_messages: list[dict[str, Any]] = []
            latest_user_request = _latest_user_request(request_messages)
            for call in turn.tool_calls:
                result_text = "工具调用未返回结果"
                async for event, result_text in tool_executor.execute(
                    call,
                    tool_context,
                    resolved_model,
                    settings,
                    permission_policy,
                    inline_result_chars,
                    latest_user_request,
                    turn.content[-10_000:],
                ):
                    yield event
                inline_result_chars += len(result_text)
                tool_message = {
                    "role": "tool",
                    "tool_call_id": call.call_id,
                    "content": result_text,
                }
                pending_tool_messages.append(tool_message)
                request_messages.append(tool_message)

            active_tokens = self._token_estimator.estimate_hybrid(
                turn.usage.prompt_tokens,
                pending_tool_messages,
                request_messages,
                prompt.tools,
            )
            yield RunEvent(
                type="usage",
                model=resolved_model,
                usage=_to_run_usage(cumulative_usage),
                active_context_tokens=active_tokens,
            )
            should_compact, _threshold = self._context_planner.should_compact_tokens(
                settings, active_tokens
            )
            if (
                should_compact
                and self._compact_history is not None
                and self._prompt_supplier is not None
            ):
                prefix_count = len(prompt.system_messages) + len(prompt.context_messages)
                compactable, retained = self._context_planner.split_rendered_for_compaction(
                    request_messages[prefix_count:]
                )
                if compactable:
                    compact_item_id = f"context-inline-{uuid.uuid4()}"
                    yield RunEvent(
                        type="context_compaction_started",
                        item_id=compact_item_id,
                        title="自动整理上下文",
                        delta="工具调用后正在整理上下文…",
                        model=resolved_model,
                    )
                    try:
                        compacted = await self._compact_history(
                            settings, compactable, active_summary
                        )
                    except Exception:  # noqa: BLE001 - provider boundary
                        yield RunEvent(
                            type="context_compaction_failed",
                            item_id=compact_item_id,
                            title="上下文压缩失败",
                            delta="保留当前上下文继续执行",
                            error_message="上下文压缩失败",
                            model=resolved_model,
                        )
                        continue
                    cumulative_usage = add_token_usage(
                        (cumulative_usage, compacted.usage)
                    )
                    active_summary = compacted.message
                    prompt = self._prompt_supplier(active_summary)
                    request_messages = [
                        *prompt.system_messages,
                        *prompt.context_messages,
                        *retained,
                    ]
                    after_tokens = (
                        self._token_estimator.estimate_messages(request_messages)
                        + self._token_estimator.estimate_tools(prompt.tools)
                    )
                    yield RunEvent(
                        type="context_compacted",
                        item_id=compact_item_id,
                        title="已压缩上下文",
                        delta=f"已压缩上下文 · {active_tokens} → {after_tokens} Token",
                        metadata={
                            "summary": active_summary,
                            "beforeTokens": active_tokens,
                            "afterTokens": after_tokens,
                            "trigger": "auto",
                            "phase": "mid_turn",
                            "usage": compacted.usage.model_dump(by_alias=True),
                        },
                        model=compacted.model,
                        active_context_tokens=after_tokens,
                    )
        raise ValueError("工具调用轮次超过限制")


def _to_run_usage(usage: TokenUsageResponse) -> RunUsage:
    return RunUsage(
        prompt_tokens=usage.prompt_tokens,
        completion_tokens=usage.completion_tokens,
        total_tokens=usage.total_tokens,
        input_tokens=usage.input_tokens,
        output_tokens=usage.output_tokens,
        reasoning_tokens=usage.reasoning_tokens,
        cache_read_tokens=usage.cache_read_tokens,
        cache_write_tokens=usage.cache_write_tokens,
        cache_metrics_available=usage.cache_metrics_available,
    )


def _latest_user_request(messages: list[dict[str, Any]]) -> str:
    for message in reversed(messages):
        if message.get("role") != "user":
            continue
        content = message.get("content")
        if isinstance(content, str) and content.strip():
            return content[-20_000:]
    return ""
