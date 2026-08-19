import asyncio
import hashlib
import json
import time
import uuid
from collections.abc import AsyncIterator, Awaitable
from dataclasses import replace
from typing import Any, Literal, TypeVar

from app.execution.tool_result_processor import ToolResultProcessor
from app.harness.contracts import ProviderToolCall
from app.harness.run_control import RunControl, await_or_pause
from app.harness.run_event import RunEvent, RunUsage
from app.model.model_connection_settings import ModelConnectionSettings
from app.permission.broker import ApprovalBroker
from app.permission.config_store import PermissionConfigStore
from app.permission.engine import PermissionEngine
from app.permission.model import (
    ApprovalDecision,
    PermissionDecision,
    PermissionMode,
    PermissionPolicy,
)
from app.permission.reviewer import (
    ApprovalReviewDecision,
    ApprovalReviewer,
    ApprovalReviewRequest,
    ApprovalReviewResult,
)
from app.tool.base import ToolContext
from app.tool.registry import ToolRegistry

_AwaitedValue = TypeVar("_AwaitedValue")


class ToolCallExecutor:
    """执行一次工具调用，并保持现有审批与公开事件语义。"""

    def __init__(
        self,
        registry: ToolRegistry,
        permission_engine: PermissionEngine,
        approval_broker: ApprovalBroker,
        permission_config_store: PermissionConfigStore,
        result_processor: ToolResultProcessor,
        approval_reviewer: ApprovalReviewer | None = None,
        blocked_call_signatures: set[str] | None = None,
        run_control: RunControl | None = None,
    ) -> None:
        self._registry = registry
        self._permission_engine = permission_engine
        self._approval_broker = approval_broker
        self._permission_config_store = permission_config_store
        self._result_processor = result_processor
        self._approval_reviewer = approval_reviewer
        self._blocked_call_signatures = (
            blocked_call_signatures
            if blocked_call_signatures is not None
            else set()
        )
        self._run_control = run_control

    def is_concurrency_safe(self, call: ProviderToolCall) -> bool:
        """Classify one model call without performing I/O or mutation."""
        try:
            arguments = json.loads(call.arguments_json or "{}")
            if not isinstance(arguments, dict):
                return False
            tool, normalized = self._registry.validate(call.name, arguments)
            return tool.is_concurrency_safe(normalized) is True
        except Exception:  # noqa: BLE001 - scheduler classification fails closed
            # Classification is a scheduling hint and must fail closed.
            return False

    async def execute(
        self,
        call: ProviderToolCall,
        tool_context: ToolContext,
        model: str,
        settings: ModelConnectionSettings,
        permission_policy: PermissionPolicy,
        inline_result_chars: int,
        user_request: str = "",
        assistant_context: str = "",
        *,
        defer_result_processing: bool = False,
    ) -> AsyncIterator[tuple[RunEvent, str]]:
        item_id = str(uuid.uuid4())
        title = call.name
        try:
            arguments = json.loads(call.arguments_json or "{}")
            if not isinstance(arguments, dict):
                raise TypeError("工具参数必须是对象")
        except (json.JSONDecodeError, TypeError) as error:
            result_text = f"工具参数无效：{error}"
            yield RunEvent(
                type="tool_failed",
                item_id=item_id,
                tool_call_id=call.call_id,
                tool_name=call.name,
                title=call.name,
                arguments={},
                output=result_text,
                error_message=result_text,
                model=model,
            ), result_text
            return

        try:
            tool, arguments = self._registry.validate(call.name, arguments)
            title = tool.display_title(arguments)
            policy_workspace = (
                tool_context.workspace_path
                if tool_context.workspace_scoped
                else None
            )
            workspace_metadata = (
                str(policy_workspace) if policy_workspace is not None else ""
            )
            call_signature = _tool_call_signature(call.name, arguments)
            if call_signature in self._blocked_call_signatures:
                result_text = _automatic_block_result(
                    "同一工具调用此前已被智能审批阻止，不会重复执行。",
                    error_code="approval_retry_blocked",
                )
                yield RunEvent(
                    type="tool_failed",
                    item_id=item_id,
                    tool_call_id=call.call_id,
                    tool_name=call.name,
                    title=title,
                    arguments=arguments,
                    output="已跳过此前被智能审批阻止的重复调用。",
                    error_message="重复调用未执行",
                    metadata={
                        "failureKind": "approval_retry_blocked",
                        "toolExecutionState": "not_started",
                        "workspacePath": workspace_metadata,
                    },
                    model=model,
                ), result_text
                return
            effective_policy = self._permission_config_store.load_policy(
                policy_workspace,
                permission_policy,
            )
            evaluation = self._permission_engine.evaluate(
                tool,
                tool_context,
                arguments,
                effective_policy,
            )
            permission_metadata = {
                "permissionLayer": evaluation.layer,
                "permissionReason": evaluation.reason,
                "riskLevel": evaluation.risk_level,
                "reversible": evaluation.reversible,
                "workspacePath": workspace_metadata,
                "callSignature": _tool_call_digest(call_signature),
            }
            if evaluation.decision is PermissionDecision.DENY:
                self._blocked_call_signatures.add(call_signature)
                denied_metadata = {
                    **permission_metadata,
                    "failureKind": "permission_denied",
                    "toolExecutionState": "not_started",
                }
                result_text = _automatic_block_result(
                    f"权限系统已拒绝：{evaluation.reason}",
                    error_code="permission_denied",
                )
                yield RunEvent(
                    type="tool_failed",
                    item_id=item_id,
                    tool_call_id=call.call_id,
                    tool_name=call.name,
                    title=title,
                    arguments=arguments,
                    output=evaluation.reason,
                    error_message=evaluation.reason,
                    metadata=denied_metadata,
                    permission_layer=evaluation.layer,
                    reason=evaluation.reason,
                    risk_level=evaluation.risk_level,
                    reversible=evaluation.reversible,
                    model=model,
                ), result_text
                return

            execution_context = tool_context
            if evaluation.decision is PermissionDecision.ASK:
                if effective_policy.mode is PermissionMode.AUTO_APPROVE:
                    if (
                        evaluation.layer != "mode"
                        or self._approval_reviewer is None
                    ):
                        self._blocked_call_signatures.add(call_signature)
                        block_reason = (
                            "替我审批模式不会请求人工确认，本次调用未执行："
                            f"{evaluation.reason}"
                        )
                        blocked_metadata = {
                            **permission_metadata,
                            "failureKind": "automatic_approval_blocked",
                            "toolExecutionState": "not_started",
                        }
                        result_text = _automatic_block_result(
                            block_reason,
                            error_code="automatic_approval_blocked",
                        )
                        yield RunEvent(
                            type="tool_failed",
                            item_id=item_id,
                            tool_call_id=call.call_id,
                            tool_name=call.name,
                            title=title,
                            arguments=arguments,
                            output=block_reason,
                            error_message=block_reason,
                            metadata=blocked_metadata,
                            permission_layer=evaluation.layer,
                            reason=evaluation.reason,
                            risk_level=evaluation.risk_level,
                            reversible=evaluation.reversible,
                            model=model,
                        ), result_text
                        return

                    review_item_id = f"approval-review-{item_id}"
                    review_started_at = time.perf_counter()
                    yield RunEvent(
                        type="approval_review_started",
                        item_id=review_item_id,
                        tool_call_id=call.call_id,
                        tool_name=call.name,
                        title=title,
                        arguments=arguments,
                        permission_layer=evaluation.layer,
                        reason=evaluation.reason,
                        risk_level=evaluation.risk_level,
                        reversible=evaluation.reversible,
                        metadata={
                            **permission_metadata,
                            "approvalReviewer": "agent",
                            "approvalReviewDecision": "reviewing",
                        },
                        model=model,
                    ), ""
                    paused, review = await self._operation_or_pause(
                        self._approval_reviewer.review(
                            settings,
                            ApprovalReviewRequest(
                                tool_name=call.name,
                                tool_category=tool.category.value,
                                arguments=arguments,
                                workspace_path=policy_workspace,
                                user_request=user_request,
                                assistant_context=assistant_context,
                                permission_layer=evaluation.layer,
                                permission_reason=evaluation.reason,
                                risk_level=evaluation.risk_level,
                                reversible=evaluation.reversible,
                                grants_external_path=(
                                    evaluation.grants_external_path
                                ),
                            ),
                        ),
                    )
                    if paused:
                        paused_metadata = {
                            **permission_metadata,
                            "approvalReviewer": "agent",
                            "approvalReviewDecision": "paused",
                            "failureKind": "turn_paused",
                            "toolExecutionState": "not_started",
                        }
                        result_text = json.dumps(
                            {
                                "ok": False,
                                "content": "当前回合已暂停，工具尚未执行",
                            },
                            ensure_ascii=False,
                        )
                        yield RunEvent(
                            type="approval_review_completed",
                            item_id=review_item_id,
                            tool_call_id=call.call_id,
                            tool_name=call.name,
                            title=title,
                            arguments=arguments,
                            output="任务已暂停",
                            permission_layer=evaluation.layer,
                            reason="任务已暂停",
                            risk_level=evaluation.risk_level,
                            reversible=evaluation.reversible,
                            decision="deny",
                            metadata=paused_metadata,
                            model=model,
                        ), result_text
                        yield RunEvent(
                            type="tool_failed",
                            item_id=item_id,
                            tool_call_id=call.call_id,
                            tool_name=call.name,
                            title=title,
                            arguments=arguments,
                            output="当前回合已暂停，工具尚未执行",
                            error_message="任务已暂停",
                            metadata=paused_metadata,
                            model=model,
                        ), result_text
                        return
                    assert review is not None
                    review_duration_ms = max(
                        1,
                        int((time.perf_counter() - review_started_at) * 1_000),
                    )
                    permission_metadata = {
                        **permission_metadata,
                        "approvalReviewer": "agent",
                        "approvalReviewDecision": review.decision.value,
                        "approvalReviewReason": review.reason,
                        "approvalReviewRiskLevel": review.risk_level,
                        "approvalReviewerModel": review.reviewer_model,
                        "approvalReviewFallback": review.fallback,
                    }
                    if _has_billable_usage(review):
                        yield RunEvent(
                            type="usage",
                            model=review.reviewer_model or model,
                            usage=_to_run_usage(review),
                            metadata={
                                "usageDelta": True,
                                "usageCategory": "approval_review",
                            },
                        ), ""
                    allowed_by_reviewer = (
                        review.decision is ApprovalReviewDecision.ALLOW_ONCE
                    )
                    result_text = ""
                    if not allowed_by_reviewer:
                        self._blocked_call_signatures.add(call_signature)
                        failure_kind = (
                            "approval_reviewer_unavailable"
                            if review.fallback
                            else "approval_review_blocked"
                        )
                        permission_metadata = {
                            **permission_metadata,
                            "failureKind": failure_kind,
                            "toolExecutionState": "not_started",
                        }
                        blocked_reason = _review_block_reason(review)
                        result_text = _automatic_block_result(
                            blocked_reason,
                            error_code=failure_kind,
                        )
                    yield RunEvent(
                        type="approval_review_completed",
                        item_id=review_item_id,
                        tool_call_id=call.call_id,
                        tool_name=call.name,
                        title=title,
                        arguments=arguments,
                        output=review.reason,
                        duration_ms=review_duration_ms,
                        permission_layer=evaluation.layer,
                        reason=review.reason,
                        risk_level=review.risk_level,
                        reversible=evaluation.reversible,
                        decision="allow" if allowed_by_reviewer else "deny",
                        metadata=permission_metadata,
                        model=model,
                    ), result_text
                    if not allowed_by_reviewer:
                        return
                else:
                    approval = self._approval_broker.create(
                        tool_context.correlation_id
                    )
                    yield RunEvent(
                        type="tool_approval_requested",
                        item_id=item_id,
                        tool_call_id=call.call_id,
                        tool_name=call.name,
                        title=title,
                        arguments=arguments,
                        approval_id=approval.approval_id,
                        permission_layer=evaluation.layer,
                        reason=evaluation.reason,
                        risk_level=evaluation.risk_level,
                        reversible=evaluation.reversible,
                        metadata=permission_metadata,
                        model=model,
                    ), ""
                    approval_decision = await self._wait_for_approval(
                        approval.approval_id
                    )
                    if approval_decision is None:
                        paused_metadata = {
                            **permission_metadata,
                            "failureKind": "turn_paused",
                            "toolExecutionState": "not_started",
                        }
                        yield RunEvent(
                            type="tool_approval_resolved",
                            item_id=item_id,
                            tool_call_id=call.call_id,
                            tool_name=call.name,
                            title=title,
                            arguments=arguments,
                            approval_id=approval.approval_id,
                            permission_layer=evaluation.layer,
                            reason="任务已暂停",
                            risk_level=evaluation.risk_level,
                            reversible=evaluation.reversible,
                            decision="deny",
                            metadata=paused_metadata,
                            model=model,
                        ), ""
                        result_text = json.dumps(
                            {
                                "ok": False,
                                "content": "当前回合已暂停，工具尚未执行",
                            },
                            ensure_ascii=False,
                        )
                        yield RunEvent(
                            type="tool_failed",
                            item_id=item_id,
                            tool_call_id=call.call_id,
                            tool_name=call.name,
                            title=title,
                            arguments=arguments,
                            output="当前回合已暂停，工具尚未执行",
                            error_message="任务已暂停",
                            metadata=paused_metadata,
                            model=model,
                        ), result_text
                        return
                    allowed = approval_decision is not ApprovalDecision.DENY
                    decision: Literal["allow", "deny"] = (
                        "allow" if allowed else "deny"
                    )
                    yield RunEvent(
                        type="tool_approval_resolved",
                        item_id=item_id,
                        tool_call_id=call.call_id,
                        tool_name=call.name,
                        title=title,
                        arguments=arguments,
                        approval_id=approval.approval_id,
                        permission_layer=evaluation.layer,
                        reason=evaluation.reason,
                        risk_level=evaluation.risk_level,
                        reversible=evaluation.reversible,
                        decision=decision,
                        metadata=permission_metadata,
                        model=model,
                    ), ""
                    if not allowed:
                        denied_message = "用户拒绝了本次工具调用"
                        denied_metadata = {
                            **permission_metadata,
                            "failureKind": "human_approval_denied",
                            "toolExecutionState": "not_started",
                        }
                        result_text = json.dumps(
                            {"ok": False, "content": denied_message},
                            ensure_ascii=False,
                        )
                        yield RunEvent(
                            type="tool_failed",
                            item_id=item_id,
                            tool_call_id=call.call_id,
                            tool_name=call.name,
                            title=title,
                            arguments=arguments,
                            output=denied_message,
                            error_message=denied_message,
                            metadata=denied_metadata,
                            model=model,
                        ), result_text
                        return
                    if (
                        approval_decision is ApprovalDecision.ALLOW_ALWAYS
                        and not evaluation.grants_external_path
                        and policy_workspace is not None
                    ):
                        self._permission_config_store.add_local_allow(
                            policy_workspace,
                            tool,
                            arguments,
                        )
                    if evaluation.grants_external_path:
                        execution_context = replace(
                            tool_context,
                            allow_external_paths=True,
                        )

            if self._pause_requested():
                paused_message = "当前回合已暂停，工具尚未执行"
                yield RunEvent(
                    type="tool_failed",
                    item_id=item_id,
                    tool_call_id=call.call_id,
                    tool_name=call.name,
                    title=title,
                    arguments=arguments,
                    output=paused_message,
                    error_message="任务已暂停",
                    metadata={
                        **permission_metadata,
                        "failureKind": "turn_paused",
                        "toolExecutionState": "not_started",
                    },
                    model=model,
                ), json.dumps(
                    {"ok": False, "content": paused_message},
                    ensure_ascii=False,
                )
                return

            yield RunEvent(
                type="tool_started",
                item_id=item_id,
                tool_call_id=call.call_id,
                tool_name=call.name,
                title=title,
                arguments=arguments,
                metadata=permission_metadata,
                model=model,
            ), ""
            emitted_events: asyncio.Queue[RunEvent] = asyncio.Queue()
            execution_context = replace(
                execution_context,
                emit_event=emitted_events.put,
            )
            execution_task = asyncio.create_task(self._registry.execute(
                call.name,
                execution_context,
                arguments,
            ))
            try:
                while not execution_task.done():
                    event_task = asyncio.create_task(emitted_events.get())
                    done, _pending = await asyncio.wait(
                        {execution_task, event_task},
                        return_when=asyncio.FIRST_COMPLETED,
                    )
                    if event_task in done:
                        yield event_task.result(), ""
                    else:
                        event_task.cancel()
                        await asyncio.gather(event_task, return_exceptions=True)
                while not emitted_events.empty():
                    yield emitted_events.get_nowait(), ""
                result = await execution_task
            except BaseException:
                if not execution_task.done():
                    execution_task.cancel()
                    await asyncio.gather(
                        execution_task,
                        return_exceptions=True,
                    )
                raise
            if not defer_result_processing:
                result = self._result_processor.process(
                    call.name,
                    call.call_id,
                    result,
                    execution_context,
                    inline_result_chars,
                )
            event_type: Literal["tool_failed", "tool_completed"] = (
                "tool_failed" if result.is_error else "tool_completed"
            )
            duration_ms = int(result.metadata.get("durationMs") or 0)
            raw_exit_code = result.metadata.get("exitCode")
            exit_code = raw_exit_code if isinstance(raw_exit_code, int) else None
            result_text = json.dumps(
                {
                    "ok": event_type == "tool_completed",
                    "content": result.content,
                },
                ensure_ascii=False,
            )
            yield RunEvent(
                type=event_type,
                item_id=item_id,
                tool_call_id=call.call_id,
                tool_name=call.name,
                title=title,
                arguments=arguments,
                output=result.content,
                duration_ms=duration_ms,
                exit_code=exit_code,
                metadata={**permission_metadata, **dict(result.metadata)},
                error_message=result.content if result.is_error else "",
                model=model,
            ), result_text

        except asyncio.CancelledError:
            if not self._pause_requested():
                raise
            result_text = json.dumps(
                {
                    "ok": False,
                    "content": "当前回合已暂停，工具未继续执行",
                },
                ensure_ascii=False,
            )
            yield RunEvent(
                type="tool_failed",
                item_id=item_id,
                tool_call_id=call.call_id,
                tool_name=call.name,
                title=title,
                arguments=arguments,
                output="当前回合已暂停，工具未继续执行",
                error_message="任务已暂停",
                metadata={
                    "failureKind": "turn_paused",
                    "toolExecutionState": "cancelled_before_body",
                },
                model=model,
            ), result_text
        except (OSError, TimeoutError, TypeError, UnicodeError, ValueError) as error:
            result_text = f"工具执行失败：{error}"
            yield RunEvent(
                type="tool_failed",
                item_id=item_id,
                tool_call_id=call.call_id,
                tool_name=call.name,
                title=title,
                arguments=arguments,
                output=result_text,
                error_message=str(error),
                model=model,
            ), result_text

    async def _wait_for_approval(
        self,
        approval_id: str,
    ) -> ApprovalDecision | None:
        paused, decision = await await_or_pause(
            self._approval_broker.wait(approval_id),
            self._run_control,
        )
        return None if paused else decision

    async def _operation_or_pause(
        self,
        awaitable: Awaitable[_AwaitedValue],
    ) -> tuple[bool, _AwaitedValue | None]:
        return await await_or_pause(awaitable, self._run_control)

    def _pause_requested(self) -> bool:
        return (
            self._run_control is not None
            and self._run_control.pause_requested
        )


def _tool_call_signature(tool_name: str, arguments: dict[str, Any]) -> str:
    normalized = json.dumps(
        arguments,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return f"{tool_name.casefold()}:{normalized}"


def _tool_call_digest(signature: str) -> str:
    return hashlib.sha256(signature.encode("utf-8")).hexdigest()


def _review_block_reason(review: ApprovalReviewResult) -> str:
    if review.fallback:
        return f"智能审批暂不可用，本次调用未执行：{review.reason}"
    if review.decision is ApprovalReviewDecision.REQUIRE_HUMAN:
        return (
            "智能审批认为该调用需要人工确认；替我审批模式不会请求用户点击，"
            f"因此本次未执行：{review.reason}"
        )
    return f"智能审批未通过，本次调用未执行：{review.reason}"


def _automatic_block_result(reason: str, *, error_code: str) -> str:
    return json.dumps(
        {
            "ok": False,
            "content": reason,
            "errorCode": error_code,
            "retryable": False,
            "nextAction": (
                "不要原样重试同一调用。请尝试范围更小、更安全或不需要额外权限的"
                "替代方案；如果没有替代方案，继续完成其余工作，并在最终答复中说明"
                "未执行项及用户可自行执行的步骤。"
            ),
        },
        ensure_ascii=False,
    )


def _to_run_usage(review: ApprovalReviewResult) -> RunUsage:
    usage = review.usage
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


def _has_billable_usage(review: ApprovalReviewResult) -> bool:
    usage = review.usage
    return any((
        usage.total_tokens,
        usage.prompt_tokens,
        usage.completion_tokens,
        usage.input_tokens,
        usage.output_tokens,
        usage.reasoning_tokens,
        usage.cache_read_tokens,
        usage.cache_write_tokens,
    ))
