package com.lumora.core.conversation.domain.model;

import java.util.List;
import java.util.Map;

public class ChatMessage {

    private final String role;
    private final String content;
    private final String messageId;
    private final Integer sequence;
    private final List<ChatToolCall> toolCalls;
    private final String toolCallId;
    private final List<MessageAttachment> attachments;
    private final Map<String, Object> providerState;

    public ChatMessage(String role, String content) {
        this(role, content, null, null, List.of(), null, List.of(), Map.of());
    }

    public ChatMessage(String role, String content, String messageId,
            Integer sequence) {
        this(role, content, messageId, sequence, List.of(), null, List.of(),
                Map.of());
    }

    public ChatMessage(
            String role,
            String content,
            String messageId,
            Integer sequence,
            List<ChatToolCall> toolCalls,
            String toolCallId
    ) {
        this(role, content, messageId, sequence, toolCalls, toolCallId,
                List.of(), Map.of());
    }

    public ChatMessage(
            String role,
            String content,
            String messageId,
            Integer sequence,
            List<ChatToolCall> toolCalls,
            String toolCallId,
            List<MessageAttachment> attachments
    ) {
        this(role, content, messageId, sequence, toolCalls, toolCallId,
                attachments, Map.of());
    }

    public ChatMessage(
            String role,
            String content,
            String messageId,
            Integer sequence,
            List<ChatToolCall> toolCalls,
            String toolCallId,
            List<MessageAttachment> attachments,
            Map<String, Object> providerState
    ) {
        this.role = role;
        this.content = content;
        this.messageId = messageId;
        this.sequence = sequence;
        this.toolCalls = toolCalls == null ? List.of() : List.copyOf(toolCalls);
        this.toolCallId = toolCallId;
        this.attachments = MessageAttachment.normalize(attachments);
        this.providerState = providerState == null
                ? Map.of() : Map.copyOf(providerState);
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
    public List<MessageAttachment> getAttachments() { return attachments; }
    public Map<String, Object> getProviderState() { return providerState; }
}
