package com.lumora.core.agent.dto.response;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;

public class AgentTokenUsageResponse {

    private final int promptTokens;
    private final int completionTokens;
    private final int totalTokens;
    private final int inputTokens;
    private final int outputTokens;
    private final int reasoningTokens;
    private final int cacheReadTokens;
    private final int cacheWriteTokens;
    private final boolean cacheMetricsAvailable;

    @JsonCreator
    public AgentTokenUsageResponse(
            @JsonProperty("promptTokens") int promptTokens,
            @JsonProperty("completionTokens") int completionTokens,
            @JsonProperty("totalTokens") int totalTokens,
            @JsonProperty("inputTokens") int inputTokens,
            @JsonProperty("outputTokens") int outputTokens,
            @JsonProperty("reasoningTokens") int reasoningTokens,
            @JsonProperty("cacheReadTokens") int cacheReadTokens,
            @JsonProperty("cacheWriteTokens") int cacheWriteTokens,
            @JsonProperty("cacheMetricsAvailable") boolean cacheMetricsAvailable
    ) {
        this.promptTokens = promptTokens;
        this.completionTokens = completionTokens;
        this.totalTokens = totalTokens;
        this.inputTokens = inputTokens;
        this.outputTokens = outputTokens;
        this.reasoningTokens = reasoningTokens;
        this.cacheReadTokens = cacheReadTokens;
        this.cacheWriteTokens = cacheWriteTokens;
        this.cacheMetricsAvailable = cacheMetricsAvailable;
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

    public int getInputTokens() { return inputTokens; }
    public int getOutputTokens() { return outputTokens; }
    public int getReasoningTokens() { return reasoningTokens; }
    public int getCacheReadTokens() { return cacheReadTokens; }
    public int getCacheWriteTokens() { return cacheWriteTokens; }
    public boolean isCacheMetricsAvailable() { return cacheMetricsAvailable; }
}
