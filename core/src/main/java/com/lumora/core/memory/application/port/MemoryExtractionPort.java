package com.lumora.core.memory.application.port;

import com.lumora.core.memory.domain.model.MemoryCandidate;

import java.util.List;

/**
 * Extracts structured memory candidates from a completed conversation turn.
 */
public interface MemoryExtractionPort {

    List<MemoryCandidate> extractMemories(String userMessage,
            String assistantMessage, String existingMemorySummary,
            String workspacePath, String correlationId);
}
