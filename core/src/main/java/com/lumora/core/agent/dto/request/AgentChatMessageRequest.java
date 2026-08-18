package com.lumora.core.agent.dto.request;

import java.util.List;

public class AgentChatMessageRequest {

    private final String role;
    private final String content;
    private final String messageId;
    private final Integer sequence;
    private final List<AgentChatToolCallRequest> toolCalls;
    private final String toolCallId;
    private final List<AgentMessageAttachmentRequest> attachments;

    public AgentChatMessageRequest(String role, String content) {
        this(role, content, null, null, List.of(), null, List.of());
    }

    public AgentChatMessageRequest(String role, String content,
            String messageId, Integer sequence) {
        this(role, content, messageId, sequence, List.of(), null, List.of());
    }

    public AgentChatMessageRequest(
            String role,
            String content,
            String messageId,
            Integer sequence,
            List<AgentChatToolCallRequest> toolCalls,
            String toolCallId
    ) {
        this(role, content, messageId, sequence, toolCalls, toolCallId,
                List.of());
    }

    public AgentChatMessageRequest(
            String role,
            String content,
            String messageId,
            Integer sequence,
            List<AgentChatToolCallRequest> toolCalls,
            String toolCallId,
            List<AgentMessageAttachmentRequest> attachments
    ) {
        this.role = role;
        this.content = content;
        this.messageId = messageId;
        this.sequence = sequence;
        this.toolCalls = toolCalls == null ? List.of() : List.copyOf(toolCalls);
        this.toolCallId = toolCallId;
        this.attachments = attachments == null
                ? List.of() : List.copyOf(attachments);
    }

    public String getRole() {
        return role;
    }

    public String getContent() {
        return content;
    }

    public String getMessageId() { return messageId; }
    public Integer getSequence() { return sequence; }
    public List<AgentChatToolCallRequest> getToolCalls() { return toolCalls; }
    public String getToolCallId() { return toolCallId; }
    public List<AgentMessageAttachmentRequest> getAttachments() {
        return attachments;
    }
}
