import uuid
from collections.abc import AsyncIterator
from typing import Any

from app.context.estimator import TokenEstimator
from app.context.planner import ContextPlanner
from app.dto.request.chat_completion_request import ChatMessageRequest
from app.execution.tool_call_executor import ToolCallExecutor
from app.execution.tool_result_processor import ToolResultProcessor
from app.harness.contracts import (
    HistoryCompactor,
    PromptSupplier,
    TurnCompleter,
)
from app.harness.run_event import RunEvent, RunUsage
from app.model.model_connection_settings import ModelConnectionSettings
from app.permission.broker import ApprovalBroker
from app.permission.config_store import PermissionConfigStore
from app.permission.engine import PermissionEngine
from app.permission.model import PermissionPolicy
from app.prompt.prompt_assembly import PromptAssembly
from app.tool.base import ToolContext
from app.tool.registry import ToolRegistry


class AgentLoopRunner:
    """编排模型回合、工具执行和公开工作事件。"""

    def __init__(
        self,
        complete_turn: TurnCompleter,
        compact_history: HistoryCompactor | None = None,
        prompt_supplier: PromptSupplier | None = None,
        context_planner: ContextPlanner | None = None,
        result_processor: ToolResultProcessor | None = None,
    ) -> None:
        self._complete_turn = complete_turn
        self._compact_history = compact_history
        self._prompt_supplier = prompt_supplier
        self._context_planner = context_planner or ContextPlanner()
        self._token_estimator = TokenEstimator()
        self._result_processor = result_processor or ToolResultProcessor()

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
        prompt_tokens = completion_tokens = total_tokens = 0
        active_context_tokens = 0
        resolved_model = settings.model
        active_summary = conversation_summary

        for _iteration in range(20):
            turn = await self._complete_turn(
                settings,
                request_messages,
                prompt.tools,
                reasoning_effort,
            )
            resolved_model = turn.model
            prompt_tokens += turn.usage.prompt_tokens
            completion_tokens += turn.usage.completion_tokens
            total_tokens += turn.usage.total_tokens
            active_context_tokens = turn.usage.prompt_tokens or (
                self._token_estimator.estimate_messages(request_messages)
                + self._token_estimator.estimate_tools(prompt.tools)
            )
            if turn.reasoning:
                yield RunEvent(
                    type="reasoning_delta",
                    delta=turn.reasoning,
                    model=resolved_model,
                )
            if not turn.tool_calls:
                if not turn.content.strip():
                    raise ValueError("模型返回了空消息")
                yield RunEvent(
                    type="text_delta", delta=turn.content, model=resolved_model
                )
                yield RunEvent(
                    type="usage",
                    model=resolved_model,
                    usage=RunUsage(
                        prompt_tokens=prompt_tokens,
                        completion_tokens=completion_tokens,
                        total_tokens=total_tokens,
                    ),
                    active_context_tokens=active_context_tokens,
                )
                yield RunEvent(type="completed", model=resolved_model)
                return

            if turn.content.strip():
                yield RunEvent(
                    type="progress_message",
                    item_id=str(uuid.uuid4()),
                    delta=turn.content.strip(),
                    model=resolved_model,
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
            tool_executor = ToolCallExecutor(
                registry,
                permission_engine,
                approval_broker,
                permission_config_store,
                self._result_processor,
            )
            for call in turn.tool_calls:
                result_text = "工具调用未返回结果"
                async for event, result_text in tool_executor.execute(
                    call,
                    tool_context,
                    resolved_model,
                    permission_policy,
                    inline_result_chars,
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
                    prompt_tokens += compacted.usage.prompt_tokens
                    completion_tokens += compacted.usage.completion_tokens
                    total_tokens += compacted.usage.total_tokens
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
