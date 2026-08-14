package com.lumora.core.memory.application.model;

import com.lumora.core.conversation.domain.model.TokenUsage;
import com.lumora.core.memory.domain.model.MemoryCandidate;

import java.util.List;

/** Provider result for one billed memory-extraction request. */
public record MemoryExtractionBatch(
        List<MemoryCandidate> candidates,
        String model,
        TokenUsage usage
) {
    public MemoryExtractionBatch {
        candidates = candidates == null ? List.of() : List.copyOf(candidates);
        model = model == null ? "" : model;
        usage = usage == null ? new TokenUsage(0, 0, 0) : usage;
    }
}
