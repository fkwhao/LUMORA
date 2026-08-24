from typing import Any

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
                inputTokens=event.usage.input_tokens,
                outputTokens=event.usage.output_tokens,
                reasoningTokens=event.usage.reasoning_tokens,
                cacheReadTokens=event.usage.cache_read_tokens,
                cacheWriteTokens=event.usage.cache_write_tokens,
                cacheMetricsAvailable=event.usage.cache_metrics_available,
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
            metadata=_without_none_values(event.metadata),
            approvalId=event.approval_id,
            permissionLayer=event.permission_layer,
            reason=event.reason,
            riskLevel=event.risk_level,
            reversible=event.reversible,
            decision=event.decision,
        )


def _without_none_values(values: dict[str, Any]) -> dict[str, Any]:
    """Keep Java's immutable-map transport contract free of null values."""
    return {
        # Provider continuation payloads are protocol-opaque. A JSON null in a
        # tool input, citation, or provider block is data rather than a Java
        # transport placeholder and must survive the SSE/Core round trip.
        key: value if key == "providerState" else _clean_transport_value(value)
        for key, value in values.items()
        if value is not None
    }


def _clean_transport_value(value: Any) -> Any:
    if isinstance(value, dict):
        return _without_none_values(value)
    if isinstance(value, list):
        return [
            _clean_transport_value(item)
            for item in value
            if item is not None
        ]
    if isinstance(value, tuple):
        return tuple(
            _clean_transport_value(item)
            for item in value
            if item is not None
        )
    return value
