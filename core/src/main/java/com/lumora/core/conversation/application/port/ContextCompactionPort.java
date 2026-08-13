package com.lumora.core.conversation.application.port;

import com.lumora.core.conversation.domain.model.ChatMessage;
import com.lumora.core.conversation.domain.model.ContextCompaction;

import java.util.List;

/**
 * Compacts persisted conversation context through the configured runtime.
 */
public interface ContextCompactionPort {

    ContextCompaction compactContext(List<ChatMessage> messages,
            String memorySummary, String taskId, String conversationSummary,
            String model, String correlationId);
}
