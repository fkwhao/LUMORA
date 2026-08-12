package com.lumora.core.conversation.domain.model;

public record AggregateTokenUsage(
        long promptTokens,
        long completionTokens,
        long totalTokens,
        long inputTokens,
        long outputTokens,
        long reasoningTokens,
        long cacheReadTokens,
        long cacheWriteTokens,
        boolean cacheMetricsAvailable
) {
}
