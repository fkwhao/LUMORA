package com.lumora.core.agent.dto.request;

public class AgentChatMessageRequest {

    private final String role;
    private final String content;

    public AgentChatMessageRequest(String role, String content) {
        this.role = role;
        this.content = content;
    }

    public String getRole() {
        return role;
    }

    public String getContent() {
        return content;
    }
}
