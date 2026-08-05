import json
import uuid
from collections.abc import AsyncIterator
from dataclasses import replace
from typing import Literal

from app.execution.tool_result_processor import ToolResultProcessor
from app.harness.contracts import ProviderToolCall
from app.harness.run_event import RunEvent
from app.permission.broker import ApprovalBroker
from app.permission.config_store import PermissionConfigStore
from app.permission.engine import PermissionEngine
from app.permission.model import (
    ApprovalDecision,
    PermissionDecision,
    PermissionPolicy,
)
from app.tool.base import ToolContext
from app.tool.registry import ToolRegistry


class ToolCallExecutor:
    """执行一次工具调用，并保持现有审批与公开事件语义。"""

    def __init__(
        self,
        registry: ToolRegistry,
        permission_engine: PermissionEngine,
        approval_broker: ApprovalBroker,
        permission_config_store: PermissionConfigStore,
        result_processor: ToolResultProcessor,
    ) -> None:
        self._registry = registry
        self._permission_engine = permission_engine
        self._approval_broker = approval_broker
        self._permission_config_store = permission_config_store
        self._result_processor = result_processor

    async def execute(
        self,
        call: ProviderToolCall,
        tool_context: ToolContext,
        model: str,
        permission_policy: PermissionPolicy,
        inline_result_chars: int,
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
            effective_policy = self._permission_config_store.load_policy(
                tool_context.workspace_path,
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
            }
            if evaluation.decision is PermissionDecision.DENY:
                result_text = json.dumps(
                    {
                        "ok": False,
                        "content": f"权限系统已拒绝：{evaluation.reason}",
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
                    output=evaluation.reason,
                    error_message=evaluation.reason,
                    metadata=permission_metadata,
                    permission_layer=evaluation.layer,
                    reason=evaluation.reason,
                    risk_level=evaluation.risk_level,
                    reversible=evaluation.reversible,
                    model=model,
                ), result_text
                return

            execution_context = tool_context
            if evaluation.decision is PermissionDecision.ASK:
                approval = self._approval_broker.create(tool_context.correlation_id)
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
                approval_decision = await self._approval_broker.wait(
                    approval.approval_id
                )
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
                        metadata=permission_metadata,
                        model=model,
                    ), result_text
                    return
                if (
                    approval_decision is ApprovalDecision.ALLOW_ALWAYS
                    and not evaluation.grants_external_path
                ):
                    self._permission_config_store.add_local_allow(
                        tool_context.workspace_path,
                        tool,
                        arguments,
                    )
                if evaluation.grants_external_path:
                    execution_context = replace(
                        tool_context,
                        allow_external_paths=True,
                    )

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
            result = await self._registry.execute(
                call.name,
                execution_context,
                arguments,
            )
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
