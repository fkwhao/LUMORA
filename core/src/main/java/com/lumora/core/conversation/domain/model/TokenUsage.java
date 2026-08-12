package com.lumora.core.conversation.domain.model;

public class TokenUsage {

    private final int promptTokens;
    private final int completionTokens;
    private final int totalTokens;
    private final int inputTokens;
    private final int outputTokens;
    private final int reasoningTokens;
    private final int cacheReadTokens;
    private final int cacheWriteTokens;
    private final boolean cacheMetricsAvailable;

    public TokenUsage(
            int promptTokens,
            int completionTokens,
            int totalTokens
    ) {
        this(
                promptTokens, completionTokens, totalTokens,
                promptTokens, completionTokens, 0, 0, 0, false
        );
    }

    public TokenUsage(
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
