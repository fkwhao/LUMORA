from collections.abc import AsyncIterator
from dataclasses import replace
from pathlib import Path

from app.context.planner import ContextPlanner
from app.dto.request.chat_completion_request import ChatMessageRequest
from app.execution.budget import BudgetExceeded
from app.execution.tool_result_processor import ToolResultProcessor
from app.harness.agent_loop import AgentLoopRunner
from app.harness.contracts import PromptSupplier
from app.harness.ports.model_provider import ModelProviderPort
from app.harness.run_control import RunControl, await_or_pause
from app.harness.run_event import RunEvent, RunUsage
from app.model.model_connection_settings import ModelConnectionSettings
from app.permission.broker import ApprovalBroker
from app.permission.config_store import PermissionConfigStore
from app.permission.engine import PermissionEngine
from app.permission.model import PermissionPolicy
from app.prompt.prompt_assembly import PromptAssembly
from app.tool.base import ToolContext
from app.tool.registry import ToolRegistry


class AgentHarness:
    """连接模型、上下文与工具执行的一次 Agent 运行边界。"""

    def __init__(
        self,
        provider: ModelProviderPort,
        context_planner: ContextPlanner | None = None,
        result_processor: ToolResultProcessor | None = None,
        max_parallel_tool_calls: int = 10,
    ) -> None:
        self._provider = provider
        self._context_planner = context_planner
        self._result_processor = result_processor
        self._max_parallel_tool_calls = max_parallel_tool_calls

    async def stream(
        self,
        settings: ModelConnectionSettings,
        prompt: PromptAssembly,
        messages: list[ChatMessageRequest],
        reasoning_effort: str | None,
        registry: ToolRegistry,
        tool_context: ToolContext | None,
        permission_policy: PermissionPolicy,
        permission_engine: PermissionEngine,
        approval_broker: ApprovalBroker,
        permission_config_store: PermissionConfigStore,
        prompt_supplier: PromptSupplier,
        conversation_summary: str | None,
        run_control: RunControl | None = None,
    ) -> AsyncIterator[RunEvent]:
        carried_usage: RunUsage | None = None
        if tool_context is None or not prompt.tools:
            if _pause_requested(run_control):
                yield _paused_event(settings.model)
                return
            native_messages = list(messages)
            if run_control is not None:
                for steer in run_control.claim_steers():
                    native_messages.append(ChatMessageRequest(
                        role="user", content=steer.content
                    ))
                    yield RunEvent(
                        type="steer_claimed",
                        item_id=steer.input_id,
                        delta=steer.content,
                        model=settings.model,
                    )
            budget = (
                tool_context.execution_budget
                if tool_context is not None
                else None
            )
            if budget is not None:
                try:
                    budget.reserve_model_request()
                except BudgetExceeded as error:
                    yield _budget_failed_event(error, settings.model)
                    return
            stream = self._provider.stream(
                settings,
                prompt,
                native_messages,
                reasoning_effort,
            )
            assistant_parts: list[str] = []
            while True:
                try:
                    paused, event = await _next_event_or_pause(
                        stream, run_control
                    )
                except StopAsyncIteration:
                    return
                if paused:
                    yield _paused_event(settings.model)
                    return
                assert event is not None
                if event.type == "text_reset":
                    assistant_parts.clear()
                elif event.type == "text_delta":
                    assistant_parts.append(event.delta)
                if event.type == "usage" and event.usage is not None:
                    carried_usage = event.usage
                if event.type != "completed":
                    yield event
                    continue
                if budget is not None:
                    try:
                        budget.check_wall_time()
                    except BudgetExceeded as error:
                        yield _budget_failed_event(
                            error,
                            event.model or settings.model,
                        )
                        return
                pending_steers = (
                    run_control.close_and_claim_steers()
                    if run_control is not None
                    else ()
                )
                if not pending_steers:
                    yield event
                    return
                assert run_control is not None
                assistant_content = "".join(assistant_parts).strip()
                if assistant_content:
                    native_messages.append(ChatMessageRequest(
                        role="assistant", content=assistant_content
                    ))
                for steer in pending_steers:
                    native_messages.append(ChatMessageRequest(
                        role="user", content=steer.content
                    ))
                    yield RunEvent(
                        type="steer_claimed",
                        item_id=steer.input_id,
                        delta=steer.content,
                        model=event.model or settings.model,
                    )
                yield RunEvent(
                    type="text_reset", model=event.model or settings.model
                )
                run_control.reopen_steers()
                messages = native_messages
                break

        runner = AgentLoopRunner(
            self._provider.complete_agent_turn,
            self._provider.compact_agent_history,
            prompt_supplier,
            self._context_planner,
            self._result_processor,
            stream_turn=getattr(self._provider, "stream_agent_turn", None),
            max_parallel_tool_calls=self._max_parallel_tool_calls,
        )
        runtime_tool_context = replace(
            tool_context or ToolContext(workspace_path=Path.cwd()),
            cancelled=lambda: _pause_requested(run_control),
        )
        async for event in runner.stream(
            settings,
            prompt,
            messages,
            reasoning_effort,
            registry,
            runtime_tool_context,
            permission_policy,
            permission_engine,
            approval_broker,
            permission_config_store,
            conversation_summary,
            run_control,
        ):
            yield _with_carried_usage(event, carried_usage)


def _pause_requested(run_control: RunControl | None) -> bool:
    return run_control is not None and run_control.pause_requested


def _paused_event(model: str) -> RunEvent:
    return RunEvent(
        type="paused",
        model=model,
        metadata={"turnStatus": "aborted", "pauseReason": "user"},
    )


def _budget_failed_event(error: BudgetExceeded, model: str) -> RunEvent:
    return RunEvent(
        type="failed",
        error_message=str(error),
        model=model,
        metadata=error.metadata(),
    )


async def _next_event_or_pause(
    stream: AsyncIterator[RunEvent],
    run_control: RunControl | None,
) -> tuple[bool, RunEvent | None]:
    return await await_or_pause(anext(stream), run_control)


def _with_carried_usage(
    event: RunEvent,
    carried: RunUsage | None,
) -> RunEvent:
    if carried is None or event.type != "usage" or event.usage is None:
        return event
    current = event.usage
    return replace(event, usage=RunUsage(
        prompt_tokens=carried.prompt_tokens + current.prompt_tokens,
        completion_tokens=(
            carried.completion_tokens + current.completion_tokens
        ),
        total_tokens=carried.total_tokens + current.total_tokens,
        input_tokens=carried.input_tokens + current.input_tokens,
        output_tokens=carried.output_tokens + current.output_tokens,
        reasoning_tokens=(
            carried.reasoning_tokens + current.reasoning_tokens
        ),
        cache_read_tokens=(
            carried.cache_read_tokens + current.cache_read_tokens
        ),
        cache_write_tokens=(
            carried.cache_write_tokens + current.cache_write_tokens
        ),
        cache_metrics_available=(
            carried.cache_metrics_available
            or current.cache_metrics_available
        ),
    ))
