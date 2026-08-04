import json
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass, replace
from typing import Any, Literal

from app.dto.request.chat_completion_request import ChatMessageRequest
from app.dto.response.chat_completion_response import TokenUsageResponse
from app.dto.response.chat_stream_event_response import ChatStreamEventResponse
from app.model.model_connection_settings import ModelConnectionSettings
from app.permission.broker import ApprovalBroker
from app.permission.config_store import PermissionConfigStore
from app.permission.engine import PermissionEngine
from app.permission.model import (
    ApprovalDecision,
    PermissionDecision,
    PermissionPolicy,
)
from app.prompt.prompt_assembly import PromptAssembly
from app.tool.base import ToolContext
from app.tool.registry import ToolRegistry


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


class AgentLoopRunner:
    """编排模型回合、工具执行和公开工作事件。"""

    def __init__(self, complete_turn: TurnCompleter) -> None:
        self._complete_turn = complete_turn

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
    ) -> AsyncIterator[ChatStreamEventResponse]:
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
        resolved_model = settings.model

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
            if turn.reasoning:
                yield ChatStreamEventResponse(
                    type="reasoning_delta",
                    delta=turn.reasoning,
                    model=resolved_model,
                )
            if not turn.tool_calls:
                if not turn.content.strip():
                    raise ValueError("模型返回了空消息")
                yield ChatStreamEventResponse(
                    type="text_delta", delta=turn.content, model=resolved_model
                )
                yield ChatStreamEventResponse(
                    type="usage",
                    model=resolved_model,
                    usage=TokenUsageResponse(
                        promptTokens=prompt_tokens,
                        completionTokens=completion_tokens,
                        totalTokens=total_tokens,
                    ),
                )
                yield ChatStreamEventResponse(type="completed", model=resolved_model)
                return

            if turn.content.strip():
                yield ChatStreamEventResponse(
                    type="progress_message",
                    itemId=str(uuid.uuid4()),
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
            for call in turn.tool_calls:
                result_text = "工具调用未返回结果"
                async for event, result_text in self._execute_tool_call(
                    call,
                    registry,
                    tool_context,
                    resolved_model,
                    permission_policy,
                    permission_engine,
                    approval_broker,
                    permission_config_store,
                ):
                    yield event
                request_messages.append({
                    "role": "tool",
                    "tool_call_id": call.call_id,
                    "content": result_text,
                })
        raise ValueError("工具调用轮次超过限制")

    async def _execute_tool_call(
        self,
        call: ProviderToolCall,
        registry: ToolRegistry,
        tool_context: ToolContext,
        model: str,
        permission_policy: PermissionPolicy,
        permission_engine: PermissionEngine,
        approval_broker: ApprovalBroker,
        permission_config_store: PermissionConfigStore,
    ) -> AsyncIterator[tuple[ChatStreamEventResponse, str]]:
        item_id = str(uuid.uuid4())
        title = call.name
        try:
            arguments = json.loads(call.arguments_json or "{}")
            if not isinstance(arguments, dict):
                raise TypeError("工具参数必须是对象")
        except (json.JSONDecodeError, TypeError) as error:
            result_text = f"工具参数无效：{error}"
            yield ChatStreamEventResponse(
                type="tool_failed",
                itemId=item_id,
                toolCallId=call.call_id,
                toolName=call.name,
                title=call.name,
                arguments={},
                output=result_text,
                errorMessage=result_text,
                model=model,
            ), result_text
            return

        try:
            tool, arguments = registry.validate(call.name, arguments)
            title = tool.display_title(arguments)
            evaluation = permission_engine.evaluate(
                tool,
                tool_context,
                arguments,
                permission_policy,
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
                yield ChatStreamEventResponse(
                    type="tool_failed",
                    itemId=item_id,
                    toolCallId=call.call_id,
                    toolName=call.name,
                    title=title,
                    arguments=arguments,
                    output=evaluation.reason,
                    errorMessage=evaluation.reason,
                    metadata=permission_metadata,
                    permissionLayer=evaluation.layer,
                    reason=evaluation.reason,
                    riskLevel=evaluation.risk_level,
                    reversible=evaluation.reversible,
                    model=model,
                ), result_text
                return

            execution_context = tool_context
            if evaluation.decision is PermissionDecision.ASK:
                approval = approval_broker.create(tool_context.correlation_id)
                yield ChatStreamEventResponse(
                    type="tool_approval_requested",
                    itemId=item_id,
                    toolCallId=call.call_id,
                    toolName=call.name,
                    title=title,
                    arguments=arguments,
                    approvalId=approval.approval_id,
                    permissionLayer=evaluation.layer,
                    reason=evaluation.reason,
                    riskLevel=evaluation.risk_level,
                    reversible=evaluation.reversible,
                    metadata=permission_metadata,
                    model=model,
                ), ""
                approval_decision = await approval_broker.wait(approval.approval_id)
                allowed = approval_decision is not ApprovalDecision.DENY
                decision: Literal["allow", "deny"] = (
                    "allow" if allowed else "deny"
                )
                yield ChatStreamEventResponse(
                    type="tool_approval_resolved",
                    itemId=item_id,
                    toolCallId=call.call_id,
                    toolName=call.name,
                    title=title,
                    arguments=arguments,
                    approvalId=approval.approval_id,
                    permissionLayer=evaluation.layer,
                    reason=evaluation.reason,
                    riskLevel=evaluation.risk_level,
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
                    yield ChatStreamEventResponse(
                        type="tool_failed",
                        itemId=item_id,
                        toolCallId=call.call_id,
                        toolName=call.name,
                        title=title,
                        arguments=arguments,
                        output=denied_message,
                        errorMessage=denied_message,
                        metadata=permission_metadata,
                        model=model,
                    ), result_text
                    return
                if (
                    approval_decision is ApprovalDecision.ALLOW_ALWAYS
                    and not evaluation.grants_external_path
                ):
                    permission_config_store.add_local_allow(
                        tool_context.workspace_path,
                        tool,
                        arguments,
                    )
                if evaluation.grants_external_path:
                    execution_context = replace(
                        tool_context,
                        allow_external_paths=True,
                    )

            yield ChatStreamEventResponse(
                type="tool_started",
                itemId=item_id,
                toolCallId=call.call_id,
                toolName=call.name,
                title=title,
                arguments=arguments,
                metadata=permission_metadata,
                model=model,
            ), ""
            result = await registry.execute(call.name, execution_context, arguments)
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
            yield ChatStreamEventResponse(
                type=event_type,
                itemId=item_id,
                toolCallId=call.call_id,
                toolName=call.name,
                title=title,
                arguments=arguments,
                output=result.content,
                durationMs=duration_ms,
                exitCode=exit_code,
                metadata={**permission_metadata, **dict(result.metadata)},
                errorMessage=result.content if result.is_error else "",
                model=model,
            ), result_text
        except (OSError, TimeoutError, TypeError, UnicodeError, ValueError) as error:
            result_text = f"工具执行失败：{error}"
            yield ChatStreamEventResponse(
                type="tool_failed",
                itemId=item_id,
                toolCallId=call.call_id,
                toolName=call.name,
                title=title,
                arguments=arguments,
                output=result_text,
                errorMessage=str(error),
                model=model,
            ), result_text
