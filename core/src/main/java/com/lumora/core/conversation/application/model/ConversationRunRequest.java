package com.lumora.core.conversation.application.model;

import com.lumora.core.conversation.domain.model.ChatMessage;
import com.lumora.core.memory.domain.model.MemoryContextItem;

import java.util.List;

/**
 * Immutable input for one streamed conversation run.
 */
public record ConversationRunRequest(
        List<ChatMessage> messages,
        String correlationId,
        String model,
        String reasoningEffort,
        String memorySummary,
        String workspacePath,
        String permissionMode,
        String taskId,
        String conversationSummary,
        List<MemoryContextItem> memoryCandidates
) {
    public ConversationRunRequest {
        messages = messages == null ? List.of() : List.copyOf(messages);
        memoryCandidates = memoryCandidates == null
                ? List.of() : List.copyOf(memoryCandidates);
    }
}
