package com.lumora.core.agent.dto.request;

public class AgentMemoryExtractionRequest {

    private final String userMessage;
    private final String assistantMessage;
    private final String existingMemorySummary;
    private final AgentModelConnectionRequest connection;

    public AgentMemoryExtractionRequest(
            String userMessage,
            String assistantMessage,
            String existingMemorySummary,
            AgentModelConnectionRequest connection
    ) {
        this.userMessage = userMessage;
        this.assistantMessage = assistantMessage;
        this.existingMemorySummary = existingMemorySummary;
        this.connection = connection;
    }

    public String getUserMessage() {
        return userMessage;
    }

    public String getAssistantMessage() {
        return assistantMessage;
    }

    public String getExistingMemorySummary() {
        return existingMemorySummary;
    }

    public AgentModelConnectionRequest getConnection() {
        return connection;
    }
}
