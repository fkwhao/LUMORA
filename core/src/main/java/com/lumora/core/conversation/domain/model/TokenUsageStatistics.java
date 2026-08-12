package com.lumora.core.conversation.domain.model;

import java.util.List;

public record TokenUsageStatistics(
        AggregateTokenUsage usage,
        long peakDailyTokens,
        int activeDays,
        int currentStreak,
        int longestStreak,
        int requestCount,
        int conversationCount,
        List<DailyTokenUsage> daily
) {
}
