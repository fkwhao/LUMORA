package com.lumora.core.conversation.domain.model;

import java.util.List;
import java.util.Map;

public record AgentCheckpointSnapshot(
        long sequence,
        long consumedInboxSequence,
        List<Map<String, Object>> transcript,
        String summary
) {
    public AgentCheckpointSnapshot {
        transcript = transcript == null ? List.of() : List.copyOf(transcript);
    }
}
