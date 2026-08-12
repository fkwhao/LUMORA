package com.lumora.core.conversation.api.controller;

import com.lumora.core.conversation.api.dto.response.TokenUsageStatisticsResponse;
import com.lumora.core.conversation.application.support.ConversationUsageStatisticsService;
import com.lumora.core.shared.api.constant.ApiPathConstants;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class UsageStatisticsController {

    private final ConversationUsageStatisticsService statisticsService;

    @GetMapping(ApiPathConstants.USAGE_STATISTICS)
    public TokenUsageStatisticsResponse statistics(
            @RequestParam(defaultValue = "365") int days
    ) {
        return TokenUsageStatisticsResponse.fromModel(
                statisticsService.statistics(days)
        );
    }
}
