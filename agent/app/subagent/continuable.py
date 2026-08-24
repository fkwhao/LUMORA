import asyncio
import json
import time
import uuid
from dataclasses import dataclass, field, replace

from app.dto.request.chat_completion_request import (
    AgentSessionSnapshotRequest,
    ChatMessageRequest,
)
from app.dto.response.chat_completion_response import TokenUsageResponse
from app.execution.budget import BudgetExceeded
from app.execution.write_intents import (
    WriterConflict,
    WriteScope,
    declared_write_scopes,
)
from app.harness.run_control import await_or_pause
from app.harness.run_event import RunEvent, RunUsage
from app.subagent.runtime import (
    _AGENT_LIFECYCLE_EVENT_TYPES,
    _MAX_VISIBLE_CHILD_EVENTS,
    _VISIBLE_CHILD_EVENT_TYPES,
    SubagentRuntime,
    _SubagentRunControl,
    _usage_metadata,
)
from app.tool.base import (
    ToolCategory,
    ToolContext,
    ToolInput,
    ToolResult,
    function_tool,
)


@dataclass(slots=True)
class _InboxMessage:
    message_id: str
    sequence: int
    sender_agent_id: str
    content: str
    status: str = "pending"


@dataclass(slots=True)
class _Session:
    agent_id: str
    session_id: str
    parent_agent_id: str
    parent_session_id: str
    label: str
    delegation_depth: int
    model: str
    status: str = "idle"
    transcript: list[ChatMessageRequest] = field(default_factory=list)
    summary: str = ""
    inbox: list[_InboxMessage] = field(default_factory=list)
    consumed_inbox_sequence: int = 0
    checkpoint_sequence: int = 0
    latest_report: str = ""
    unread_report_count: int = 0
    active_task: asyncio.Task[None] | None = field(default=None, repr=False)
    activation_id: str = ""
    recovered: bool = False
    interrupt_reason: str = ""
    write_scopes: tuple[WriteScope, ...] = ()

    @property
    def next_inbox_sequence(self) -> int:
        return max((message.sequence for message in self.inbox), default=0) + 1


class ContinuableSessionManager:
    """Request-scoped control plane hydrated from Core-owned checkpoints."""

    def __init__(
        self,
        runtime: SubagentRuntime,
        snapshots: tuple[AgentSessionSnapshotRequest, ...] = (),
    ) -> None:
        self._runtime = runtime
        self._sessions: dict[str, _Session] = {}
        self._agent_index: dict[str, str] = {}
        for snapshot in snapshots:
            if snapshot.mode != "continuable":
                continue
            checkpoint = snapshot.checkpoint
            session = _Session(
                agent_id=snapshot.agent_id,
                session_id=snapshot.session_id,
                parent_agent_id=snapshot.parent_agent_id,
                parent_session_id=snapshot.parent_session_id,
                label=snapshot.label,
                delegation_depth=snapshot.delegation_depth,
                model=snapshot.model,
                status=(
                    "interrupted"
                    if snapshot.status == "running"
                    else snapshot.status
                ),
                transcript=(
                    list(checkpoint.transcript) if checkpoint is not None else []
                ),
                summary=(
                    (checkpoint.summary or "")
                    if checkpoint is not None
                    else ""
                ),
                inbox=[
                    _InboxMessage(
                        message.message_id,
                        message.sequence,
                        message.sender_agent_id,
                        message.content,
                        message.status,
                    )
                    for message in snapshot.inbox
                ],
                consumed_inbox_sequence=(
                    checkpoint.consumed_inbox_sequence
                    if checkpoint is not None
                    else 0
                ),
                checkpoint_sequence=(
                    checkpoint.sequence if checkpoint is not None else 0
                ),
                latest_report=snapshot.latest_report or "",
                unread_report_count=snapshot.unread_report_count,
                recovered=snapshot.status == "running",
            )
            self._put(session)

    def tools(self):
        return (
            create_send_agent_message_tool(self),
            create_list_agent_sessions_tool(self),
            create_interrupt_agent_tool(self),
            create_report_to_parent_tool(self),
        )

    async def start(
        self,
        context: ToolContext,
        *,
        description: str,
        prompt: str,
        write_scopes: tuple[str, ...] = (),
    ) -> ToolResult:
        depth = context.delegation_depth + 1
        if depth > self._runtime._max_delegation_depth:
            return ToolResult(
                f"已达到 Agent 委派深度上限（{self._runtime._max_delegation_depth} 层）",
                is_error=True,
                metadata={"failureKind": "delegation_depth_exceeded"},
            )
        agent_id = str(uuid.uuid4())
        parent_session_id = (
            context.session_id
            or context.correlation_id
            or context.task_id
            or "local"
        )
        try:
            resolved_write_scopes = declared_write_scopes(
                context.workspace_path,
                write_scopes,
            )
        except ValueError as error:
            return ToolResult(
                str(error),
                is_error=True,
                metadata={"failureKind": "invalid_write_scope"},
            )
        session = _Session(
            agent_id=agent_id,
            session_id=f"{parent_session_id}:agent:{agent_id}",
            parent_agent_id=context.agent_id or "supervisor",
            parent_session_id=parent_session_id,
            label=description,
            delegation_depth=depth,
            model=self._runtime._settings.model,
            write_scopes=resolved_write_scopes,
        )
        self._put(session)
        await self._emit_control(context, RunEvent(
            type="agent_session_created",
            item_id=agent_id,
            title=description,
            model=session.model,
            metadata={
                **self._identity(session),
                "sessionMode": "continuable",
                "agentStatus": "idle",
                "checkpointSequence": 0,
                "writeScopes": [
                    scope.metadata() for scope in session.write_scopes
                ],
            },
        ))
        await self._enqueue(session, context, prompt)
        self._schedule(session, context)
        return ToolResult(
            json.dumps({
                "agentId": session.agent_id,
                "sessionId": session.session_id,
                "status": "running",
                "mode": "continuable",
                "message": "任务已进入子 Agent Inbox；Activation 已在后台启动。",
            }, ensure_ascii=False),
            metadata={
                **self._identity(session),
                "sessionMode": "continuable",
                "agentStatus": "running",
            },
        )

    async def send(
        self,
        context: ToolContext,
        target: str,
        content: str,
    ) -> ToolResult:
        session = self._managed_session(context, target)
        if session is None:
            return ToolResult(
                "未找到当前 Agent 可管理的 continuable Session",
                is_error=True,
                metadata={"failureKind": "agent_session_not_found"},
            )
        if session.status == "closed":
            return ToolResult(
                "Session 已关闭，不能继续发送消息",
                is_error=True,
                metadata={"failureKind": "agent_session_closed"},
            )
        await self._enqueue(session, context, content)
        self._schedule(session, context)
        return ToolResult(
            f"消息已进入 {session.label} 的 Inbox（#{session.next_inbox_sequence - 1}）",
            metadata={
                **self._identity(session),
                "agentStatus": "running",
            },
        )

    def list(self, context: ToolContext) -> ToolResult:
        sessions = [
            session for session in self._sessions.values()
            if self._can_manage(context, session)
        ]
        payload = [{
            "agentId": session.agent_id,
            "sessionId": session.session_id,
            "label": session.label,
            "status": session.status,
            "delegationDepth": session.delegation_depth,
            "pendingInbox": sum(
                1 for message in session.inbox if message.status == "pending"
            ),
            "checkpointSequence": session.checkpoint_sequence,
            "unreadReports": session.unread_report_count,
            "latestReport": session.latest_report or None,
            "recovered": session.recovered,
        } for session in sorted(sessions, key=lambda item: item.session_id)]
        return ToolResult(json.dumps(payload, ensure_ascii=False))

    async def interrupt(
        self,
        context: ToolContext,
        target: str,
        reason: str,
    ) -> ToolResult:
        session = self._managed_session(context, target)
        if session is None:
            return ToolResult(
                "未找到当前 Agent 可管理的 continuable Session",
                is_error=True,
                metadata={"failureKind": "agent_session_not_found"},
            )
        task = session.active_task
        if task is None or task.done():
            session.status = "interrupted"
            await self._emit_control(
                context,
                self._interrupted_event(session, reason or "父 Agent 已中止"),
            )
            return ToolResult(f"{session.label} 当前没有正在执行的 Activation")
        session.status = "interrupted"
        session.interrupt_reason = reason or "父 Agent 已中止当前 Activation"
        task.cancel()
        return ToolResult(
            f"已请求中止 {session.label} 的当前 Activation；Session 保留，可再次发送消息。",
            metadata={**self._identity(session), "agentStatus": "interrupted"},
        )

    async def report(
        self,
        context: ToolContext,
        content: str,
        final: bool,
    ) -> ToolResult:
        session = self._session_by_target(context.session_id or context.agent_id)
        if session is None or session.agent_id != context.agent_id:
            return ToolResult(
                "只有 continuable 子 Agent 可以向父 Agent 报告",
                is_error=True,
                metadata={"failureKind": "not_continuable_agent"},
            )
        session.latest_report = content
        session.unread_report_count += 1
        await self._emit_control(context, RunEvent(
            type="agent_reported",
            item_id=session.agent_id,
            title=session.label,
            output=content,
            model=session.model,
            metadata={
                **self._identity(session),
                "sessionMode": "continuable",
                "agentStatus": session.status,
                "reportFinal": final,
                "unreadReportCount": session.unread_report_count,
            },
        ))
        return ToolResult("报告已提交给父 Agent。")

    async def wait_for_activations(self) -> None:
        while True:
            tasks = [
                session.active_task
                for session in self._sessions.values()
                if session.active_task is not None
                and not session.active_task.done()
            ]
            if not tasks:
                return
            await asyncio.gather(*tasks, return_exceptions=True)

    async def shutdown(self) -> None:
        """Cancel live Activations while allowing their checkpoints to flush."""
        tasks = [
            session.active_task
            for session in self._sessions.values()
            if session.active_task is not None and not session.active_task.done()
        ]
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def publish_recovery_events(self, context: ToolContext) -> None:
        """Reconcile Activations that were running when the process stopped."""
        for session in self._sessions.values():
            if not session.recovered:
                continue
            await self._emit_background(
                context,
                self._interrupted_event(
                    session,
                    "运行时已重启；当前 Activation 已中断，Session 与 Checkpoint 已保留。",
                ),
            )

    async def _enqueue(
        self,
        session: _Session,
        context: ToolContext,
        content: str,
    ) -> None:
        sequence = session.next_inbox_sequence
        message = _InboxMessage(
            message_id=str(uuid.uuid4()),
            sequence=sequence,
            sender_agent_id=context.agent_id or "supervisor",
            content=content,
        )
        session.inbox.append(message)
        await self._emit_control(context, RunEvent(
            type="agent_inbox_enqueued",
            item_id=message.message_id,
            title=session.label,
            delta=content,
            model=session.model,
            metadata={
                **self._identity(session),
                "sessionMode": "continuable",
                "inboxSequence": sequence,
                "senderAgentId": message.sender_agent_id,
                "messageStatus": "pending",
                "consumedInboxSequence": session.consumed_inbox_sequence,
            },
        ))

    def _schedule(self, session: _Session, context: ToolContext) -> None:
        if session.active_task is not None and not session.active_task.done():
            return
        session.active_task = asyncio.create_task(
            self._run_activation(session, context)
        )

    async def _run_activation(
        self,
        session: _Session,
        parent_context: ToolContext,
    ) -> None:
        try:
            write_claim = self._runtime._source_registry.write_intents.acquire(
                session.session_id,
                session.write_scopes,
                owner_label=session.label,
            )
        except WriterConflict as error:
            session.status = "failed"
            await self._emit_background(parent_context, RunEvent(
                type="agent_failed",
                item_id=session.agent_id,
                title=session.label,
                output=str(error),
                error_message=str(error),
                model=session.model,
                metadata={
                    **self._identity(session),
                    **error.metadata(),
                    "sessionMode": "continuable",
                    "agentStatus": "failed",
                },
            ))
            return
        try:
            reserved_agent = await self._runtime._reserve_agent()
        except BudgetExceeded as error:
            self._runtime._source_registry.write_intents.release(write_claim)
            session.status = "failed"
            await self._emit_background(parent_context, RunEvent(
                type="agent_failed",
                item_id=session.agent_id,
                title=session.label,
                error_message=str(error),
                model=session.model,
                metadata={
                    **self._identity(session),
                    **error.metadata(),
                    "sessionMode": "continuable",
                    "agentStatus": "failed",
                    "toolExecutionState": "not_started",
                },
            ))
            return
        if not reserved_agent:
            self._runtime._source_registry.write_intents.release(write_claim)
            session.status = "failed"
            await self._emit_background(parent_context, RunEvent(
                type="agent_failed",
                item_id=session.agent_id,
                title=session.label,
                error_message="并行 Agent 已达到上限",
                model=session.model,
                metadata={
                    **self._identity(session),
                    "sessionMode": "continuable",
                    "agentStatus": "failed",
                    "failureKind": "agent_concurrency_limit",
                    "retryable": True,
                    "toolExecutionState": "not_started",
                },
            ))
            return

        session.activation_id = str(uuid.uuid4())
        session.status = "running"
        session.interrupt_reason = ""
        started_at = time.perf_counter()
        answer_parts: list[str] = []
        latest_usage: RunUsage | None = None
        prelude_usage = RunUsage()
        usage_emitted = False
        forwarded_events = 0
        child_sequence = 0
        report_count_before = session.unread_report_count

        async def emit_latest_usage_once() -> None:
            nonlocal usage_emitted
            if latest_usage is None or usage_emitted:
                return
            await self._runtime._emit_usage(
                _background_context(parent_context),
                latest_usage,
                self._identity(session),
            )
            usage_emitted = True

        try:
            pending = sorted(
                (
                    message for message in session.inbox
                    if message.status == "pending"
                    and message.sequence > session.consumed_inbox_sequence
                ),
                key=lambda message: message.sequence,
            )
            for message in pending:
                session.transcript.append(ChatMessageRequest(
                    role="user", content=message.content
                ))
                message.status = "consumed"
                session.consumed_inbox_sequence = message.sequence

            # Persist the consumed Inbox and prompt before the model call so a
            # process loss never drops the Activation's input.
            await self._checkpoint(session, parent_context, "running")

            await self._emit_background(parent_context, RunEvent(
                type="agent_activation_started",
                item_id=session.activation_id,
                title=session.label,
                model=session.model,
                metadata={
                    **self._identity(session),
                    "sessionMode": "continuable",
                    "agentStatus": "running",
                    "activationId": session.activation_id,
                    "consumedInboxSequence": session.consumed_inbox_sequence,
                    "recovered": session.recovered,
                },
            ))
            await self._emit_background(parent_context, RunEvent(
                type="agent_started",
                item_id=session.agent_id,
                title=session.label,
                delta="continuable Agent Activation 已开始",
                model=session.model,
                metadata={
                    **self._identity(session),
                    "sessionMode": "continuable",
                    "agentStatus": "running",
                    "activationId": session.activation_id,
                    "recovered": session.recovered,
                },
            ))

            registry_context = replace(
                parent_context,
                session_id=session.parent_session_id,
                agent_id=session.parent_agent_id,
                delegation_depth=max(0, session.delegation_depth - 1),
            )
            child_registry = self._runtime._registry_for_context(
                registry_context
            )
            def prompt_supplier(summary: str | None):
                return self._runtime._build_prompt(
                    registry_context,
                    child_registry,
                    conversation_summary=summary,
                )

            child_prompt = prompt_supplier(session.summary or None)
            child_context = replace(
                registry_context,
                session_id=session.session_id,
                agent_id=session.agent_id,
                delegation_depth=session.delegation_depth,
                emit_event=None,
            )

            plan_history_compaction = getattr(
                self._runtime._harness,
                "plan_history_compaction",
                None,
            )
            compaction_plan = (
                plan_history_compaction(
                    self._runtime._settings,
                    child_prompt,
                    list(session.transcript),
                )
                if callable(plan_history_compaction)
                else None
            )
            if compaction_plan is not None:
                compaction_item_id = (
                    f"context-activation-{session.activation_id}"
                )
                child_sequence += 1
                if forwarded_events < _MAX_VISIBLE_CHILD_EVENTS:
                    forwarded_events += 1
                    await self._emit_background(
                        parent_context,
                        self._runtime._wrap_child_event(
                            RunEvent(
                                type="context_compaction_started",
                                item_id=compaction_item_id,
                                title="自动整理上下文",
                                delta="恢复子 Session 前正在整理上下文…",
                                model=session.model,
                            ),
                            self._identity(session),
                            child_sequence,
                        ),
                    )
                try:
                    if child_context.execution_budget is not None:
                        child_context.execution_budget.reserve_model_request()
                    compact_history = self._runtime._harness.compact_history
                    paused, compacted = await await_or_pause(
                        compact_history(
                            self._runtime._settings,
                            compaction_plan.compactable,
                            session.summary or None,
                        ),
                        self._runtime._run_control,
                    )
                    if paused:
                        raise asyncio.CancelledError
                    assert compacted is not None
                    if child_context.execution_budget is not None:
                        child_context.execution_budget.check_wall_time()
                except BudgetExceeded:
                    raise
                except asyncio.CancelledError:
                    raise
                except Exception:
                    child_sequence += 1
                    if forwarded_events < _MAX_VISIBLE_CHILD_EVENTS:
                        forwarded_events += 1
                        await self._emit_background(
                            parent_context,
                            self._runtime._wrap_child_event(
                                RunEvent(
                                    type="context_compaction_failed",
                                    item_id=compaction_item_id,
                                    title="上下文压缩失败",
                                    delta="保留当前子 Session 上下文",
                                    error_message="上下文压缩失败",
                                    model=session.model,
                                ),
                                self._identity(session),
                                child_sequence,
                            ),
                        )
                    raise

                session.summary = compacted.message
                session.transcript = list(compaction_plan.retained)
                child_prompt = prompt_supplier(session.summary)
                after_tokens = self._runtime._harness.estimate_context_tokens(
                    self._runtime._settings,
                    child_prompt,
                    session.transcript,
                )
                compaction_usage = _to_run_usage(compacted.usage)
                prelude_usage = _sum_run_usage(
                    prelude_usage,
                    compaction_usage,
                )
                latest_usage = prelude_usage
                await self._checkpoint(session, parent_context, "running")
                child_sequence += 1
                if forwarded_events < _MAX_VISIBLE_CHILD_EVENTS:
                    forwarded_events += 1
                    await self._emit_background(
                        parent_context,
                        self._runtime._wrap_child_event(
                            RunEvent(
                                type="context_compacted",
                                item_id=compaction_item_id,
                                title="已压缩上下文",
                                delta=(
                                    "已压缩子 Session 上下文 · "
                                    f"{compaction_plan.before_tokens} → "
                                    f"{after_tokens} Token"
                                ),
                                metadata={
                                    "summary": session.summary,
                                    "beforeTokens": (
                                        compaction_plan.before_tokens
                                    ),
                                    "afterTokens": after_tokens,
                                    "trigger": "auto",
                                    "phase": "pre_activation",
                                    "compactedMessageCount": len(
                                        compaction_plan.compactable
                                    ),
                                    "retainedMessageCount": len(
                                        compaction_plan.retained
                                    ),
                                    "usage": compacted.usage.model_dump(
                                        by_alias=True
                                    ),
                                },
                                model=compacted.model,
                                usage=compaction_usage,
                                active_context_tokens=after_tokens,
                            ),
                            self._identity(session),
                            child_sequence,
                        ),
                    )

            stream = self._runtime._harness.stream(
                self._runtime._settings,
                child_prompt,
                list(session.transcript),
                self._runtime._reasoning_effort,
                child_registry,
                child_context,
                self._runtime._permission_policy,
                self._runtime._permission_engine,
                self._runtime._approval_broker,
                self._runtime._permission_config_store,
                prompt_supplier,
                session.summary or None,
                (
                    _SubagentRunControl(self._runtime._run_control)
                    if self._runtime._run_control is not None
                    else None
                ),
            )
            async for event in stream:
                child_sequence += 1
                if event.type == "protocol_message":
                    protocol_message = event.metadata.get("message")
                    if isinstance(protocol_message, dict):
                        session.transcript.append(
                            ChatMessageRequest.model_validate(protocol_message)
                        )
                elif event.type == "text_reset":
                    answer_parts.clear()
                elif event.type == "text_delta":
                    answer_parts.append(event.delta)
                elif event.type == "usage" and event.usage is not None:
                    latest_usage = _sum_run_usage(
                        prelude_usage,
                        event.usage,
                    )
                elif event.type == "context_compacted":
                    if event.usage is not None:
                        latest_usage = _sum_run_usage(
                            prelude_usage,
                            event.usage,
                        )
                    self._apply_compaction_event(session, event)
                    await self._checkpoint(
                        session,
                        parent_context,
                        "running",
                    )
                    if forwarded_events < _MAX_VISIBLE_CHILD_EVENTS:
                        forwarded_events += 1
                        await self._emit_background(
                            parent_context,
                            self._runtime._wrap_child_event(
                                event,
                                self._identity(session),
                                child_sequence,
                            ),
                        )
                elif event.type == "paused":
                    raise asyncio.CancelledError
                elif event.type in _AGENT_LIFECYCLE_EVENT_TYPES:
                    await self._emit_background(parent_context, event)
                elif (
                    event.type in _VISIBLE_CHILD_EVENT_TYPES
                    and forwarded_events < _MAX_VISIBLE_CHILD_EVENTS
                ):
                    forwarded_events += 1
                    await self._emit_background(
                        parent_context,
                        self._runtime._wrap_child_event(
                            event,
                            self._identity(session),
                            child_sequence,
                        ),
                    )
                elif event.type == "failed":
                    raise RuntimeError(
                        event.error_message or "子 Agent Activation 失败"
                    )

            answer = "".join(answer_parts).strip()
            if (
                answer
                and (
                    not session.transcript
                    or session.transcript[-1].role != "assistant"
                )
            ):
                session.transcript.append(ChatMessageRequest(
                    role="assistant", content=answer
                ))
            session.status = "idle"
            session.recovered = False
            if answer and session.unread_report_count == report_count_before:
                session.latest_report = answer
                session.unread_report_count += 1
                await self._emit_background(parent_context, RunEvent(
                    type="agent_reported",
                    item_id=session.agent_id,
                    title=session.label,
                    output=answer,
                    model=session.model,
                    metadata={
                        **self._identity(session),
                        "sessionMode": "continuable",
                        "reportFinal": False,
                        "unreadReportCount": session.unread_report_count,
                        "activationId": session.activation_id,
                    },
                ))
            await self._checkpoint(session, parent_context, "idle")
            duration_ms = int((time.perf_counter() - started_at) * 1000)
            await emit_latest_usage_once()
            await self._emit_background(parent_context, RunEvent(
                type="agent_completed",
                item_id=session.agent_id,
                title=session.label,
                output=session.latest_report,
                duration_ms=duration_ms,
                model=session.model,
                metadata={
                    **self._identity(session),
                    "sessionMode": "continuable",
                    "agentStatus": "idle",
                    "activationStatus": "completed",
                    "activationId": session.activation_id,
                    "visibleEventCount": forwarded_events,
                    "recovered": session.recovered,
                    **_usage_metadata(latest_usage),
                },
            ))
        except asyncio.CancelledError:
            session.status = "interrupted"
            await emit_latest_usage_once()
            await self._checkpoint(session, parent_context, "interrupted")
            await self._emit_background(
                parent_context,
                self._interrupted_event(
                    session,
                    session.interrupt_reason or "父 Agent 已中止当前 Activation",
                    latest_usage,
                ),
            )
        except Exception as error:  # noqa: BLE001 - activation boundary
            session.status = "failed"
            error_message = str(error) or "子 Agent Activation 失败"
            await emit_latest_usage_once()
            await self._checkpoint(session, parent_context, "failed")
            await self._emit_background(parent_context, RunEvent(
                type="agent_failed",
                item_id=session.agent_id,
                title=session.label,
                output=error_message,
                error_message=error_message,
                model=session.model,
                metadata={
                    **self._identity(session),
                    "sessionMode": "continuable",
                    "agentStatus": "failed",
                    "activationId": session.activation_id,
                    **_usage_metadata(latest_usage),
                },
            ))
        finally:
            session.active_task = None
            self._runtime._source_registry.write_intents.release(write_claim)
            await self._runtime._release_agent()
            if session.status == "idle" and any(
                message.status == "pending" for message in session.inbox
            ):
                self._schedule(session, parent_context)

    async def _checkpoint(
        self,
        session: _Session,
        context: ToolContext,
        status: str,
    ) -> None:
        session.checkpoint_sequence += 1
        await self._emit_background(context, RunEvent(
            type="agent_checkpointed",
            item_id=f"{session.session_id}:checkpoint:{session.checkpoint_sequence}",
            title=session.label,
            model=session.model,
            metadata={
                **self._identity(session),
                "sessionMode": "continuable",
                "agentStatus": status,
                "activationId": session.activation_id,
                "checkpointSequence": session.checkpoint_sequence,
                "consumedInboxSequence": session.consumed_inbox_sequence,
                "transcript": [
                    message.model_dump(by_alias=True)
                    for message in session.transcript
                ],
                "summary": session.summary,
            },
        ))

    @staticmethod
    def _apply_compaction_event(
        session: _Session,
        event: RunEvent,
    ) -> None:
        summary = event.metadata.get("summary")
        compacted_count = event.metadata.get("compactedMessageCount")
        if not isinstance(summary, str) or not summary.strip():
            raise RuntimeError("子 Session 压缩事件缺少摘要")
        if (
            not isinstance(compacted_count, int)
            or isinstance(compacted_count, bool)
            or compacted_count < 1
            or compacted_count > len(session.transcript)
        ):
            raise RuntimeError("子 Session 压缩事件的消息边界无效")
        session.summary = summary
        session.transcript = session.transcript[compacted_count:]

    def _interrupted_event(
        self,
        session: _Session,
        reason: str,
        usage: RunUsage | None = None,
    ) -> RunEvent:
        return RunEvent(
            type="agent_activation_interrupted",
            item_id=session.activation_id or session.agent_id,
            title=session.label,
            output=reason,
            model=session.model,
            metadata={
                **self._identity(session),
                "sessionMode": "continuable",
                "agentStatus": "interrupted",
                "activationId": session.activation_id,
                "interruptReason": reason,
                "recovered": session.recovered,
                **_usage_metadata(usage),
            },
        )

    async def _emit_control(
        self, context: ToolContext, event: RunEvent
    ) -> None:
        if context.emit_event is not None:
            await context.emit_event(event)
        elif context.background_event is not None:
            await context.background_event(event)

    async def _emit_background(
        self, context: ToolContext, event: RunEvent
    ) -> None:
        if context.background_event is not None:
            await context.background_event(event)
        elif context.emit_event is not None:
            await context.emit_event(event)

    def _managed_session(
        self, context: ToolContext, target: str
    ) -> _Session | None:
        session = self._session_by_target(target)
        return session if session is not None and self._can_manage(
            context, session
        ) else None

    def _session_by_target(self, target: str) -> _Session | None:
        return self._sessions.get(target) or self._sessions.get(
            self._agent_index.get(target, "")
        )

    @staticmethod
    def _can_manage(context: ToolContext, session: _Session) -> bool:
        return (
            context.agent_id == "supervisor"
            or session.parent_agent_id == context.agent_id
        )

    def _put(self, session: _Session) -> None:
        self._sessions[session.session_id] = session
        self._agent_index[session.agent_id] = session.session_id

    @staticmethod
    def _identity(session: _Session) -> dict[str, object]:
        return {
            "agentId": session.agent_id,
            "sessionId": session.session_id,
            "parentAgentId": session.parent_agent_id,
            "parentSessionId": session.parent_session_id,
            "agentLabel": session.label,
            "agentRole": "worker",
            "delegationDepth": session.delegation_depth,
            "writeScopes": [scope.metadata() for scope in session.write_scopes],
        }


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


def _sum_run_usage(left: RunUsage, right: RunUsage) -> RunUsage:
    return RunUsage(
        prompt_tokens=left.prompt_tokens + right.prompt_tokens,
        completion_tokens=left.completion_tokens + right.completion_tokens,
        total_tokens=left.total_tokens + right.total_tokens,
        input_tokens=left.input_tokens + right.input_tokens,
        output_tokens=left.output_tokens + right.output_tokens,
        reasoning_tokens=left.reasoning_tokens + right.reasoning_tokens,
        cache_read_tokens=(
            left.cache_read_tokens + right.cache_read_tokens
        ),
        cache_write_tokens=(
            left.cache_write_tokens + right.cache_write_tokens
        ),
        cache_metrics_available=(
            left.cache_metrics_available
            or right.cache_metrics_available
        ),
    )


def create_send_agent_message_tool(manager: ContinuableSessionManager):
    async def execute(context: ToolContext, data: ToolInput) -> ToolResult:
        return await manager.send(
            context,
            str(data["agentId"]).strip(),
            str(data["message"]).strip(),
        )

    return function_tool(
        name="send_agent_message",
        description=(
            "向当前 Agent 可管理的 continuable 子 Session 写入一条 FIFO Inbox 消息。"
            "若 Session 空闲，会按需启动一个新的 Activation；不会创建通用 Worker。"
        ),
        input_schema={
            "type": "object",
            "properties": {
                "agentId": {"type": "string", "minLength": 1},
                "message": {"type": "string", "minLength": 1, "maxLength": 100000},
            },
            "required": ["agentId", "message"],
            "additionalProperties": False,
        },
        execute=execute,
        category=ToolCategory.OTHER,
        read_only=True,
        retry_safe=False,
        concurrency_safe=False,
        validate=lambda data: _required_strings(data, "agentId", "message"),
        title=lambda _data: "发送子 Agent 消息",
    )


def create_list_agent_sessions_tool(manager: ContinuableSessionManager):
    def execute(context: ToolContext, _data: ToolInput) -> ToolResult:
        return manager.list(context)

    return function_tool(
        name="list_agent_sessions",
        description=(
            "列出当前 Agent 可管理的 continuable 子 Session、Activation、Inbox 和"
            "Checkpoint 摘要。需要决定发送、中止或综合报告前使用。"
        ),
        input_schema={"type": "object", "properties": {}, "additionalProperties": False},
        execute=execute,
        category=ToolCategory.OTHER,
        read_only=True,
        concurrency_safe=True,
        title=lambda _data: "查看子 Agent Session",
    )


def create_interrupt_agent_tool(manager: ContinuableSessionManager):
    async def execute(context: ToolContext, data: ToolInput) -> ToolResult:
        return await manager.interrupt(
            context,
            str(data["agentId"]).strip(),
            str(data.get("reason") or "").strip(),
        )

    return function_tool(
        name="interrupt_agent",
        description=(
            "中止指定 continuable Session 当前正在运行的 Activation，但保留 Session、"
            "Inbox 和 Checkpoint，之后仍可由 send_agent_message 重新激活。"
        ),
        input_schema={
            "type": "object",
            "properties": {
                "agentId": {"type": "string", "minLength": 1},
                "reason": {"type": "string", "maxLength": 2000},
            },
            "required": ["agentId"],
            "additionalProperties": False,
        },
        execute=execute,
        category=ToolCategory.OTHER,
        read_only=True,
        retry_safe=False,
        concurrency_safe=False,
        validate=lambda data: _required_strings(data, "agentId"),
        title=lambda _data: "中止子 Agent Activation",
    )


def create_report_to_parent_tool(manager: ContinuableSessionManager):
    async def execute(context: ToolContext, data: ToolInput) -> ToolResult:
        return await manager.report(
            context,
            str(data["content"]).strip(),
            bool(data.get("final", False)),
        )

    return function_tool(
        name="report_to_parent",
        description=(
            "continuable 子 Agent 向父 Agent 提交阶段报告或最终报告。报告会耐久保存，"
            "父 Agent 可在当前或后续 Turn 读取。"
        ),
        input_schema={
            "type": "object",
            "properties": {
                "content": {"type": "string", "minLength": 1, "maxLength": 100000},
                "final": {"type": "boolean", "default": False},
            },
            "required": ["content"],
            "additionalProperties": False,
        },
        execute=execute,
        category=ToolCategory.OTHER,
        read_only=True,
        retry_safe=False,
        concurrency_safe=False,
        validate=lambda data: _required_strings(data, "content"),
        title=lambda _data: "向父 Agent 报告",
    )


def _required_strings(data: ToolInput, *names: str) -> str | None:
    for name in names:
        value = data.get(name)
        if not isinstance(value, str) or not value.strip():
            return f"{name} 必须是非空字符串"
    return None


def _background_context(context: ToolContext) -> ToolContext:
    return replace(context, emit_event=context.background_event)
