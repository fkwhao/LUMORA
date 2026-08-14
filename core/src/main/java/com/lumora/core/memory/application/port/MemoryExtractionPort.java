package com.lumora.core.memory.application.port;

import com.lumora.core.memory.application.model.MemoryExtractionBatch;

/**
 * Extracts structured memory candidates from a completed conversation turn.
 */
public interface MemoryExtractionPort {

    MemoryExtractionBatch extractMemories(String userMessage,
            String assistantMessage, String existingMemorySummary,
            String workspacePath, String correlationId);
}
