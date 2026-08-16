package com.lumora.core.conversation.api.dto.response;

import com.fasterxml.jackson.databind.JsonNode;
import com.lumora.core.conversation.domain.model.ConversationRunEventEnvelope;

import java.time.Instant;

public record ConversationRunEventResponse(
        String runId,
        long sequence,
        Object event,
        Instant occurredAt
) {
    public static ConversationRunEventResponse from(
            ConversationRunEventEnvelope envelope
    ) {
        return new ConversationRunEventResponse(
                envelope.runId(),
                envelope.sequence(),
                envelope.event(),
                envelope.occurredAt()
        );
    }

    public static ConversationRunEventResponse replay(
            String runId,
            long sequence,
            JsonNode event,
            Instant occurredAt
    ) {
        return new ConversationRunEventResponse(
                runId, sequence, event, occurredAt
        );
    }
}
