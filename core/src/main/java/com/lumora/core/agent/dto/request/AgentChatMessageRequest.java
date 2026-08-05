package com.lumora.core.agent.dto.request;

public class AgentChatMessageRequest {

    private final String role;
    private final String content;
    private final String messageId;
    private final Integer sequence;

    public AgentChatMessageRequest(String role, String content) {
        this(role, content, null, null);
    }

    public AgentChatMessageRequest(String role, String content,
            String messageId, Integer sequence) {
        this.role = role;
        this.content = content;
        this.messageId = messageId;
        this.sequence = sequence;
    }

    public String getRole() {
        return role;
    }

    public String getContent() {
        return content;
    }

    public String getMessageId() { return messageId; }
    public Integer getSequence() { return sequence; }
}
