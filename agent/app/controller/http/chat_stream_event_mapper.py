from app.dto.response.chat_completion_response import TokenUsageResponse
from app.dto.response.chat_stream_event_response import ChatStreamEventResponse
from app.harness.run_event import RunEvent


class ChatStreamEventMapper:
    @staticmethod
    def to_response(event: RunEvent) -> ChatStreamEventResponse:
        usage = (
            TokenUsageResponse(
                promptTokens=event.usage.prompt_tokens,
                completionTokens=event.usage.completion_tokens,
                totalTokens=event.usage.total_tokens,
            )
            if event.usage is not None
            else None
        )
        return ChatStreamEventResponse(
            type=event.type,
            delta=event.delta,
            model=event.model,
            usage=usage,
            activeContextTokens=event.active_context_tokens,
            errorMessage=event.error_message,
            itemId=event.item_id,
            toolCallId=event.tool_call_id,
            toolName=event.tool_name,
            title=event.title,
            arguments=event.arguments,
            output=event.output,
            durationMs=event.duration_ms,
            exitCode=event.exit_code,
            metadata=event.metadata,
            approvalId=event.approval_id,
            permissionLayer=event.permission_layer,
            reason=event.reason,
            riskLevel=event.risk_level,
            reversible=event.reversible,
            decision=event.decision,
        )
