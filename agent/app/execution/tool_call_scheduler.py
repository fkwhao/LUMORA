import asyncio
import json
from collections.abc import AsyncIterator
from dataclasses import dataclass, field, replace
from typing import Any, TypeAlias

from app.execution.tool_call_executor import ToolCallExecutor
from app.execution.tool_result_processor import ToolResultProcessor
from app.harness.contracts import ProviderToolCall
from app.harness.run_control import RunControl
from app.harness.run_event import RunEvent
from app.model.model_connection_settings import ModelConnectionSettings
from app.permission.model import PermissionPolicy
from app.tool.base import ToolContext, ToolResult


@dataclass(frozen=True, slots=True)
class ToolCallCompleted:
    call: ProviderToolCall
    result_text: str


@dataclass(frozen=True, slots=True)
class ToolCallAborted:
    call: ProviderToolCall


ScheduledToolItem: TypeAlias = RunEvent | ToolCallCompleted | ToolCallAborted
_ExecutionPair: TypeAlias = tuple[RunEvent, str]


@dataclass(slots=True)
class _ParallelGroupState:
    calls: tuple[ProviderToolCall, ...]
    settled: dict[int, "_SettledCall"] = field(default_factory=dict)
    running: dict[int, asyncio.Task["_SettledCall"]] = field(default_factory=dict)
    next_to_start: int = 0
    next_to_commit: int = 0
    live_events: asyncio.Queue[RunEvent] = field(default_factory=asyncio.Queue)


@dataclass(frozen=True, slots=True)
class _SettledCall:
    pairs: tuple[_ExecutionPair, ...]
    result_text: str
    has_result: bool


class ToolCallScheduler:
    """Runs safe sibling calls concurrently and commits results in model order."""

    def __init__(
        self,
        executor: ToolCallExecutor,
        result_processor: ToolResultProcessor,
        max_parallel_tool_calls: int,
    ) -> None:
        if max_parallel_tool_calls < 1:
            raise ValueError("max_parallel_tool_calls 必须大于 0")
        self._executor = executor
        self._result_processor = result_processor
        self._max_parallel_tool_calls = max_parallel_tool_calls
        self._inline_result_chars = 0
        self._group_consumed = 0
        self.paused = False

    async def stream(
        self,
        calls: tuple[ProviderToolCall, ...],
        tool_context: ToolContext,
        model: str,
        settings: ModelConnectionSettings,
        permission_policy: PermissionPolicy,
        user_request: str,
        assistant_context: str,
        run_control: RunControl | None,
    ) -> AsyncIterator[ScheduledToolItem]:
        next_call = 0
        while next_call < len(calls):
            if _pause_requested(run_control):
                self.paused = True
                break
            call = calls[next_call]
            if not self._executor.is_concurrency_safe(call):
                async for item in self._run_exclusive(
                    call,
                    tool_context,
                    model,
                    settings,
                    permission_policy,
                    user_request,
                    assistant_context,
                ):
                    yield item
                next_call += 1
            else:
                self._group_consumed = 0
                async for item in self._run_parallel_group(
                    calls[next_call:],
                    tool_context,
                    model,
                    settings,
                    permission_policy,
                    user_request,
                    assistant_context,
                    run_control,
                ):
                    yield item
                next_call += self._group_consumed
            if _pause_requested(run_control):
                self.paused = True
                break

        if self.paused:
            for call in calls[next_call:]:
                yield ToolCallAborted(call)

    async def _run_exclusive(
        self,
        call: ProviderToolCall,
        tool_context: ToolContext,
        model: str,
        settings: ModelConnectionSettings,
        permission_policy: PermissionPolicy,
        user_request: str,
        assistant_context: str,
    ) -> AsyncIterator[ScheduledToolItem]:
        result_text = "工具调用未返回结果"
        has_result = False
        async for event, next_result in self._executor.execute(
            call,
            tool_context,
            model,
            settings,
            permission_policy,
            self._inline_result_chars,
            user_request,
            assistant_context,
        ):
            yield event
            result_text = next_result
            has_result = has_result or bool(next_result)
        if not has_result:
            raise RuntimeError("工具调用结束时缺少结果事件")
        self._inline_result_chars += len(result_text)
        yield ToolCallCompleted(call, result_text)

    async def _run_parallel_group(
        self,
        calls: tuple[ProviderToolCall, ...],
        tool_context: ToolContext,
        model: str,
        settings: ModelConnectionSettings,
        permission_policy: PermissionPolicy,
        user_request: str,
        assistant_context: str,
        run_control: RunControl | None,
    ) -> AsyncIterator[ScheduledToolItem]:
        state = _ParallelGroupState(calls)
        live_event_task: asyncio.Task[RunEvent] | None = None
        pause_task = (
            asyncio.create_task(run_control.wait_until_pause_requested())
            if run_control is not None
            else None
        )
        try:
            while True:
                while not state.live_events.empty():
                    yield state.live_events.get_nowait()
                self._harvest_finished(state)
                async for item in self._commit_ready(
                    state,
                    tool_context,
                ):
                    yield item

                while (
                    not self.paused
                    and state.next_to_start < len(calls)
                    and len(state.running) < self._max_parallel_tool_calls
                ):
                    call = calls[state.next_to_start]
                    if not self._executor.is_concurrency_safe(call):
                        break
                    index = state.next_to_start
                    generator = self._executor.execute(
                        call,
                        tool_context,
                        model,
                        settings,
                        permission_policy,
                        0,
                        user_request,
                        assistant_context,
                        defer_result_processing=True,
                    )
                    terminal: list[_ExecutionPair] = []
                    prepared_result_text = "工具调用未返回结果"
                    prepared_has_result = False
                    started = False
                    while True:
                        try:
                            event, result_text = await anext(generator)
                        except StopAsyncIteration:
                            break
                        prepared_result_text = result_text
                        prepared_has_result = prepared_has_result or bool(result_text)
                        if event.type == "tool_started":
                            yield event
                            state.running[index] = asyncio.create_task(
                                _drain(generator, state.live_events)
                            )
                            started = True
                            break
                        if event.type in {"tool_completed", "tool_failed"}:
                            terminal.append((event, result_text))
                        else:
                            yield event
                    if not started:
                        if not prepared_has_result:
                            raise RuntimeError("并发工具调用结束时缺少结果事件")
                        state.settled[index] = _SettledCall(
                            tuple(terminal),
                            prepared_result_text,
                            True,
                        )
                    state.next_to_start += 1
                    self._group_consumed = state.next_to_start
                    if _pause_requested(run_control):
                        self.paused = True
                    self._harvest_finished(state)
                    async for item in self._commit_ready(
                        state,
                        tool_context,
                    ):
                        yield item

                reached_boundary = self.paused or state.next_to_start >= len(calls)
                if not reached_boundary:
                    reached_boundary = not self._executor.is_concurrency_safe(
                        calls[state.next_to_start]
                    )
                if reached_boundary and not state.running:
                    break

                if not state.running:
                    continue
                waiters: set[asyncio.Future[Any]] = set(state.running.values())
                if pause_task is not None and not self.paused:
                    waiters.add(pause_task)
                if live_event_task is None:
                    live_event_task = asyncio.create_task(
                        state.live_events.get()
                    )
                waiters.add(live_event_task)
                done, _pending = await asyncio.wait(
                    waiters,
                    return_when=asyncio.FIRST_COMPLETED,
                )
                if pause_task is not None and pause_task in done:
                    self.paused = True
                if live_event_task in done:
                    yield live_event_task.result()
                    live_event_task = None
                self._harvest_finished(state)
                async for item in self._commit_ready(
                    state,
                    tool_context,
                ):
                    yield item
        except BaseException:
            await asyncio.gather(
                *state.running.values(),
                return_exceptions=True,
            )
            raise
        finally:
            if live_event_task is not None and not live_event_task.done():
                live_event_task.cancel()
                await asyncio.gather(
                    live_event_task,
                    return_exceptions=True,
                )
            if pause_task is not None and not pause_task.done():
                pause_task.cancel()
                await asyncio.gather(pause_task, return_exceptions=True)

    @staticmethod
    def _harvest_finished(state: _ParallelGroupState) -> None:
        for index, task in tuple(state.running.items()):
            if not task.done():
                continue
            state.settled[index] = task.result()
            del state.running[index]

    async def _commit_ready(
        self,
        state: _ParallelGroupState,
        tool_context: ToolContext,
    ) -> AsyncIterator[ScheduledToolItem]:
        while state.next_to_commit in state.settled:
            index = state.next_to_commit
            call = state.calls[index]
            settled = state.settled.pop(index)
            result_text = settled.result_text
            has_result = settled.has_result
            for event, next_result in settled.pairs:
                if event.type in {"tool_completed", "tool_failed"}:
                    event, next_result = self._finalize_deferred_result(
                        call,
                        event,
                        next_result,
                        tool_context,
                    )
                    has_result = True
                yield event
                result_text = next_result
            if not has_result:
                raise RuntimeError("并发工具调用结束时缺少结果事件")
            self._inline_result_chars += len(result_text)
            yield ToolCallCompleted(call, result_text)
            state.next_to_commit += 1

    def _finalize_deferred_result(
        self,
        call: ProviderToolCall,
        event: RunEvent,
        result_text: str,
        tool_context: ToolContext,
    ) -> tuple[RunEvent, str]:
        if "durationMs" not in event.metadata:
            return event, result_text
        processed = self._result_processor.process(
            call.name,
            call.call_id,
            ToolResult(
                content=event.output,
                is_error=event.type == "tool_failed",
                metadata=event.metadata,
            ),
            tool_context,
            self._inline_result_chars,
        )
        succeeded = event.type == "tool_completed"
        result_text = json.dumps(
            {"ok": succeeded, "content": processed.content},
            ensure_ascii=False,
        )
        return replace(
            event,
            output=processed.content,
            metadata=dict(processed.metadata),
            error_message="" if succeeded else processed.content,
        ), result_text


async def _drain(
    generator: AsyncIterator[_ExecutionPair],
    live_events: asyncio.Queue[RunEvent] | None = None,
) -> _SettledCall:
    pairs: list[_ExecutionPair] = []
    result_text = "工具调用未返回结果"
    has_result = False
    async for pair in generator:
        if (
            live_events is not None
            and pair[0].type not in {"tool_completed", "tool_failed"}
        ):
            await live_events.put(pair[0])
        else:
            pairs.append(pair)
        result_text = pair[1]
        has_result = has_result or bool(result_text)
    return _SettledCall(tuple(pairs), result_text, has_result)


def _pause_requested(run_control: RunControl | None) -> bool:
    return run_control is not None and run_control.pause_requested
