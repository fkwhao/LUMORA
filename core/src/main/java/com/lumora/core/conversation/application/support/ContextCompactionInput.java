package com.lumora.core.conversation.application.support;

import com.lumora.core.conversation.domain.model.ChatMessage;

import java.util.List;

public record ContextCompactionInput(
        String conversationId,
        List<ChatMessage> messages,
        String memorySummary,
        String existingSummary
) {
    public ContextCompactionInput {
        messages = List.copyOf(messages);
    }
}
