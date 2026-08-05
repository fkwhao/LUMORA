package com.lumora.core.service.support.conversation;

import com.lumora.core.model.ChatMessage;

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
