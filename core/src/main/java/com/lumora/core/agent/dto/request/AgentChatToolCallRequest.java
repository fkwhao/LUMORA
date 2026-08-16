package com.lumora.core.agent.dto.request;

public record AgentChatToolCallRequest(
        String id,
        String name,
        String arguments
) {
}
