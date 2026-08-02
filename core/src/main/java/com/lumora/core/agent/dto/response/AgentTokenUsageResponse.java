package com.lumora.core.agent.dto.response;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;

public class AgentTokenUsageResponse {

    private final int promptTokens;
    private final int completionTokens;
    private final int totalTokens;

    @JsonCreator
    public AgentTokenUsageResponse(
            @JsonProperty("promptTokens") int promptTokens,
            @JsonProperty("completionTokens") int completionTokens,
            @JsonProperty("totalTokens") int totalTokens
    ) {
        this.promptTokens = promptTokens;
        this.completionTokens = completionTokens;
        this.totalTokens = totalTokens;
    }

    public int getPromptTokens() {
        return promptTokens;
    }

    public int getCompletionTokens() {
        return completionTokens;
    }

    public int getTotalTokens() {
        return totalTokens;
    }
}
