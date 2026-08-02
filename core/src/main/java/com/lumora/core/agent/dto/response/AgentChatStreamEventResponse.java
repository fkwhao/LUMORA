package com.lumora.core.agent.dto.response;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.lumora.core.model.ChatStreamEventType;

public class AgentChatStreamEventResponse {

    private final ChatStreamEventType type;
    private final String delta;
    private final String model;
    private final AgentTokenUsageResponse usage;
    private final String errorMessage;

    @JsonCreator
    public AgentChatStreamEventResponse(
            @JsonProperty("type") ChatStreamEventType type,
            @JsonProperty("delta") String delta,
            @JsonProperty("model") String model,
            @JsonProperty("usage") AgentTokenUsageResponse usage,
            @JsonProperty("errorMessage") String errorMessage
    ) {
        this.type = type;
        this.delta = delta;
        this.model = model;
        this.usage = usage;
        this.errorMessage = errorMessage;
    }

    public ChatStreamEventType getType() {
        return type;
    }

    public String getDelta() {
        return delta;
    }

    public String getModel() {
        return model;
    }

    public AgentTokenUsageResponse getUsage() {
        return usage;
    }

    public String getErrorMessage() {
        return errorMessage;
    }
}
