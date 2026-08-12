package com.lumora.core.conversation.api.dto.response;

import com.lumora.core.conversation.domain.model.TokenUsage;

public class TokenUsageResponse {

    private final int promptTokens;
    private final int completionTokens;
    private final int totalTokens;
    private final int inputTokens;
    private final int outputTokens;
    private final int reasoningTokens;
    private final int cacheReadTokens;
    private final int cacheWriteTokens;
    private final boolean cacheMetricsAvailable;

    public TokenUsageResponse(
            int promptTokens,
            int completionTokens,
            int totalTokens
    ) {
        this(
                promptTokens, completionTokens, totalTokens,
                promptTokens, completionTokens, 0, 0, 0, false
        );
    }

    public TokenUsageResponse(
            int promptTokens,
            int completionTokens,
            int totalTokens,
            int inputTokens,
            int outputTokens,
            int reasoningTokens,
            int cacheReadTokens,
            int cacheWriteTokens,
            boolean cacheMetricsAvailable
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

    public static TokenUsageResponse fromModel(TokenUsage usage) {
        return new TokenUsageResponse(
                usage.getPromptTokens(),
                usage.getCompletionTokens(),
                usage.getTotalTokens(),
                usage.getInputTokens(),
                usage.getOutputTokens(),
                usage.getReasoningTokens(),
                usage.getCacheReadTokens(),
                usage.getCacheWriteTokens(),
                usage.isCacheMetricsAvailable()
        );
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
