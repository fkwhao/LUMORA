package com.lumora.core.conversation.api.dto.response;

import com.lumora.core.conversation.domain.model.TokenUsageStatistics;

import java.util.List;

public record TokenUsageStatisticsResponse(
        AggregateTokenUsageResponse usage,
        long peakDailyTokens,
        int activeDays,
        int currentStreak,
        int longestStreak,
        int requestCount,
        int conversationCount,
        List<DailyTokenUsageResponse> daily
) {
    public static TokenUsageStatisticsResponse fromModel(
            TokenUsageStatistics value
    ) {
        return new TokenUsageStatisticsResponse(
                AggregateTokenUsageResponse.fromModel(value.usage()),
                value.peakDailyTokens(),
                value.activeDays(),
                value.currentStreak(),
                value.longestStreak(),
                value.requestCount(),
                value.conversationCount(),
                value.daily().stream()
                        .map(DailyTokenUsageResponse::fromModel)
                        .toList()
        );
    }
}
