package com.lumora.core.agent.client;

import com.lumora.core.memory.domain.model.MemoryCandidate;
import com.lumora.core.memory.application.port.MemoryExtractionPort;
import com.lumora.core.model.application.port.ModelConnectionResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Memory-facing adapter for the Python Agent runtime.
 */
@Component
@RequiredArgsConstructor
public class AgentMemoryExtractionAdapter implements MemoryExtractionPort {

    private final AgentRuntimeClient agentRuntimeClient;
    private final ModelConnectionResolver connectionResolver;

    @Override
    public List<MemoryCandidate> extractMemories(String userMessage,
                                                      String assistantMessage, String existingMemorySummary,
                                                      String workspacePath, String correlationId) {
        return agentRuntimeClient.extractMemories(
            requireText(userMessage, "User message"),
            requireText(assistantMessage, "Assistant message"),
            existingMemorySummary,
            workspacePath,
            connectionResolver.resolve(null),
            requireText(correlationId, "Correlation ID")
        );
    }

    private static String requireText(String value, String label) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(label + " cannot be empty");
        }
        return value.trim();
    }
}
