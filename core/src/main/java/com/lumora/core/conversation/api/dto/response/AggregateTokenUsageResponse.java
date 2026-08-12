package com.lumora.core.conversation.api.dto.response;

import com.lumora.core.conversation.domain.model.AggregateTokenUsage;

public record AggregateTokenUsageResponse(
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
    public static AggregateTokenUsageResponse fromModel(
            AggregateTokenUsage value
    ) {
        return new AggregateTokenUsageResponse(
                value.promptTokens(), value.completionTokens(),
                value.totalTokens(), value.inputTokens(),
                value.outputTokens(), value.reasoningTokens(),
                value.cacheReadTokens(), value.cacheWriteTokens(),
                value.cacheMetricsAvailable()
        );
    }
}
