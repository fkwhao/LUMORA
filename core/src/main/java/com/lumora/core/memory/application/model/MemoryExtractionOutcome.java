package com.lumora.core.memory.application.model;

import com.lumora.core.conversation.domain.model.TokenUsage;

/** Stored-candidate count plus the exact provider usage for the extraction. */
public record MemoryExtractionOutcome(
        int storedCount,
        String model,
        TokenUsage usage
) {
    public MemoryExtractionOutcome {
        model = model == null ? "" : model;
        usage = usage == null ? new TokenUsage(0, 0, 0) : usage;
    }

    public static MemoryExtractionOutcome empty() {
        return new MemoryExtractionOutcome(0, "", new TokenUsage(0, 0, 0));
    }
}
