package com.lumora.core.conversation.domain.model;

import java.time.Instant;

public record ConversationRunEventEnvelope(
        String runId,
        long sequence,
        ChatStreamEvent event,
        Instant occurredAt
) {
}
