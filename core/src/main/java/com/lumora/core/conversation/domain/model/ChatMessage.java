package com.lumora.core.conversation.domain.model;

import java.util.List;

public class ChatMessage {

    private final String role;
    private final String content;
    private final String messageId;
    private final Integer sequence;
    private final List<ChatToolCall> toolCalls;
    private final String toolCallId;

    public ChatMessage(String role, String content) {
        this(role, content, null, null, List.of(), null);
    }

    public ChatMessage(String role, String content, String messageId,
            Integer sequence) {
        this(role, content, messageId, sequence, List.of(), null);
    }

    public ChatMessage(
            String role,
            String content,
            String messageId,
            Integer sequence,
            List<ChatToolCall> toolCalls,
            String toolCallId
    ) {
        this.role = role;
        this.content = content;
        this.messageId = messageId;
        this.sequence = sequence;
        this.toolCalls = toolCalls == null ? List.of() : List.copyOf(toolCalls);
        this.toolCallId = toolCallId;
    }

    public String getRole() {
        return role;
    }

    public String getContent() {
        return content;
    }

    public String getMessageId() { return messageId; }
    public Integer getSequence() { return sequence; }
    public List<ChatToolCall> getToolCalls() { return toolCalls; }
    public String getToolCallId() { return toolCallId; }
}
