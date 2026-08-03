package com.lumora.core.agent.dto.request;

import java.util.List;

public class AgentChatCompletionRequest {

    private final List<AgentChatMessageRequest> messages;
    private final AgentModelConnectionRequest connection;
    private final AgentPromptContextRequest promptContext;
    private final String reasoningEffort;

    public AgentChatCompletionRequest(
            List<AgentChatMessageRequest> messages,
            AgentModelConnectionRequest connection,
            AgentPromptContextRequest promptContext,
            String reasoningEffort
    ) {
        this.messages = List.copyOf(messages);
        this.connection = connection;
        this.promptContext = promptContext;
        this.reasoningEffort = reasoningEffort;
    }

    public List<AgentChatMessageRequest> getMessages() {
        return messages;
    }

    public AgentModelConnectionRequest getConnection() {
        return connection;
    }

    public AgentPromptContextRequest getPromptContext() {
        return promptContext;
    }

    public String getReasoningEffort() {
        return reasoningEffort;
    }
}
