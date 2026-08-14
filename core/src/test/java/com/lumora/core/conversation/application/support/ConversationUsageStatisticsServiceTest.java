package com.lumora.core.conversation.application.support;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.lumora.core.conversation.domain.entity.ConversationMessage;
import com.lumora.core.conversation.domain.model.ChatMessageRole;
import com.lumora.core.conversation.infrastructure.persistence.ConversationMessageMapper;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ConversationUsageStatisticsServiceTest {

    private static final Clock CLOCK = Clock.fixed(
            Instant.parse("2026-08-12T08:00:00Z"),
            ZoneOffset.UTC
    );

    @Test
    void aggregatesDetailedUsageAndActivityStreaks() {
        ConversationMessageMapper mapper = mock(ConversationMessageMapper.class);
        when(mapper.selectList(any(Wrapper.class))).thenReturn(List.of(
                message("conversation-1", "2026-08-10T03:00:00Z", 40, 20, 10, 30, 0),
                message("conversation-1", "2026-08-11T03:00:00Z", 20, 15, 5, 60, 5),
                message("conversation-2", "2026-08-12T03:00:00Z", 30, 10, 0, 10, 0)
        ));

        var statistics = new ConversationUsageStatisticsService(mapper, CLOCK)
                .statistics(365);

        assertThat(statistics.usage().inputTokens()).isEqualTo(90);
        assertThat(statistics.usage().outputTokens()).isEqualTo(45);
        assertThat(statistics.usage().reasoningTokens()).isEqualTo(15);
        assertThat(statistics.usage().cacheReadTokens()).isEqualTo(100);
        assertThat(statistics.usage().cacheWriteTokens()).isEqualTo(5);
        assertThat(statistics.usage().totalTokens()).isEqualTo(255);
        assertThat(statistics.activeDays()).isEqualTo(3);
        assertThat(statistics.currentStreak()).isEqualTo(3);
        assertThat(statistics.longestStreak()).isEqualTo(3);
        assertThat(statistics.requestCount()).isEqualTo(3);
        assertThat(statistics.conversationCount()).isEqualTo(2);
        assertThat(statistics.daily()).hasSize(3);
    }

    @Test
    void providerTotalIsNotReducedByAnIncompleteBreakdown() {
        ConversationMessageMapper mapper = mock(ConversationMessageMapper.class);
        ConversationMessage message = new ConversationMessage(
                "message-1",
                "conversation-1",
                1,
                ChatMessageRole.ASSISTANT,
                "answer",
                "model",
                40,
                10,
                100,
                Instant.parse("2026-08-12T03:00:00Z")
        );
        message.applyUsageDetails(40, 10, 0, 0, 0, true);
        when(mapper.selectList(any(Wrapper.class))).thenReturn(List.of(message));

        var statistics = new ConversationUsageStatisticsService(mapper, CLOCK)
                .statistics(365);

        assertThat(statistics.usage().totalTokens()).isEqualTo(100);
        assertThat(statistics.requestCount()).isEqualTo(1);
    }

    private static ConversationMessage message(
            String conversationId,
            String createdAt,
            int input,
            int output,
            int reasoning,
            int cacheRead,
            int cacheWrite
    ) {
        int prompt = input + cacheRead + cacheWrite;
        int completion = output + reasoning;
        ConversationMessage message = new ConversationMessage(
                conversationId + "-" + createdAt,
                conversationId,
                1,
                ChatMessageRole.ASSISTANT,
                "answer",
                "model",
                prompt,
                completion,
                prompt + completion,
                Instant.parse(createdAt)
        );
        message.applyUsageDetails(
                input, output, reasoning, cacheRead, cacheWrite, true
        );
        return message;
    }
}
