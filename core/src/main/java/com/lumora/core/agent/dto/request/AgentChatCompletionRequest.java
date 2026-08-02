package com.lumora.core.agent.dto.request;

import java.util.List;

public class AgentChatCompletionRequest {

    private final List<AgentChatMessageRequest> messages;
    private final AgentModelConnectionRequest connection;

    public AgentChatCompletionRequest(
            List<AgentChatMessageRequest> messages,
            AgentModelConnectionRequest connection
    ) {
        this.messages = List.copyOf(messages);
        this.connection = connection;
    }

    public List<AgentChatMessageRequest> getMessages() {
        return messages;
    }

    public AgentModelConnectionRequest getConnection() {
        return connection;
    }
}
