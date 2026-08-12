package com.lumora.core.conversation.api.dto.response;

import com.lumora.core.conversation.domain.model.DailyTokenUsage;

import java.time.LocalDate;

public record DailyTokenUsageResponse(
        LocalDate date,
        AggregateTokenUsageResponse usage,
        int requestCount
) {
    public static DailyTokenUsageResponse fromModel(DailyTokenUsage value) {
        return new DailyTokenUsageResponse(
                value.date(),
                AggregateTokenUsageResponse.fromModel(value.usage()),
                value.requestCount()
        );
    }
}
