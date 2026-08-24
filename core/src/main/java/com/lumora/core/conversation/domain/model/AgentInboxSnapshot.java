package com.lumora.core.conversation.domain.model;

public record AgentInboxSnapshot(
        String messageId,
        long sequence,
        String senderAgentId,
        String senderLabel,
        String content,
        String status,
        String messageKind
) {
}
