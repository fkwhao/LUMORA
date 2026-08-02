package com.lumora.core.agent.dto.response;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;

public class AgentChatCompletionResponse {

    private final String message;
    private final String model;
    private final AgentTokenUsageResponse usage;

    @JsonCreator
    public AgentChatCompletionResponse(
            @JsonProperty("message") String message,
            @JsonProperty("model") String model,
            @JsonProperty("usage") AgentTokenUsageResponse usage
    ) {
        this.message = message;
        this.model = model;
        this.usage = usage;
    }

    public String getMessage() {
        return message;
    }

    public String getModel() {
        return model;
    }

    public AgentTokenUsageResponse getUsage() {
        return usage;
    }
}
