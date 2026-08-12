package com.lumora.core.conversation.domain.model;

import java.time.LocalDate;

public record DailyTokenUsage(
        LocalDate date,
        AggregateTokenUsage usage,
        int requestCount
) {
}
