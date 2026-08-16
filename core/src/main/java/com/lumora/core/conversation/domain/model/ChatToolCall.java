package com.lumora.core.conversation.domain.model;

/**
 * A provider-neutral function tool call embedded in an assistant message.
 */
public record ChatToolCall(
        String id,
        String name,
        String arguments
) {
}
