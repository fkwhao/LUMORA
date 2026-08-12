package com.lumora.core.conversation.application.support;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.lumora.core.conversation.domain.entity.ConversationMessage;
import com.lumora.core.conversation.domain.model.ChatMessageRole;
import com.lumora.core.conversation.domain.model.AggregateTokenUsage;
import com.lumora.core.conversation.domain.model.DailyTokenUsage;
import com.lumora.core.conversation.domain.model.TokenUsageStatistics;
import com.lumora.core.conversation.infrastructure.persistence.ConversationMessageMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class ConversationUsageStatisticsService {

    private static final int MAX_DAYS = 3660;

    private final ConversationMessageMapper messageMapper;
    private final Clock clock;

    public TokenUsageStatistics statistics(int requestedDays) {
        int days = Math.max(7, Math.min(MAX_DAYS, requestedDays));
        ZoneId zone = ZoneId.systemDefault();
        LocalDate today = LocalDate.now(clock.withZone(zone));
        LocalDate firstVisibleDate = today.minusDays(days - 1L);
        List<ConversationMessage> messages = messageMapper.selectList(
                Wrappers.<ConversationMessage>lambdaQuery()
                        .eq(ConversationMessage::getRole, ChatMessageRole.ASSISTANT)
                        .orderByAsc(ConversationMessage::getCreatedAt)
        );

        MutableUsage total = new MutableUsage();
        Map<LocalDate, MutableUsage> byDate = new HashMap<>();
        Map<LocalDate, Integer> requestsByDate = new HashMap<>();
        Set<String> conversations = new HashSet<>();
        for (ConversationMessage message : messages) {
            if (message.getCreatedAt() == null || resolvedTotal(message) <= 0) {
                continue;
            }
            LocalDate date = message.getCreatedAt().atZone(zone).toLocalDate();
            total.add(message);
            byDate.computeIfAbsent(date, ignored -> new MutableUsage()).add(message);
            requestsByDate.merge(date, 1, Integer::sum);
            conversations.add(message.getConversationId());
        }

        List<LocalDate> activeDates = byDate.keySet().stream().sorted().toList();
        List<DailyTokenUsage> visibleDaily = activeDates.stream()
                .filter(date -> !date.isBefore(firstVisibleDate))
                .map(date -> new DailyTokenUsage(
                        date,
                        byDate.get(date).toModel(),
                        requestsByDate.getOrDefault(date, 0)
                ))
                .toList();
        long peak = byDate.values().stream()
                .mapToLong(MutableUsage::normalizedTotal)
                .max()
                .orElse(0L);

        return new TokenUsageStatistics(
                total.toModel(),
                peak,
                activeDates.size(),
                currentStreak(activeDates, today),
                longestStreak(activeDates),
                requestsByDate.values().stream().mapToInt(Integer::intValue).sum(),
                conversations.size(),
                visibleDaily
        );
    }

    private static int currentStreak(List<LocalDate> dates, LocalDate today) {
        if (dates.isEmpty()) return 0;
        Set<LocalDate> active = new HashSet<>(dates);
        LocalDate cursor = active.contains(today) ? today : today.minusDays(1);
        int streak = 0;
        while (active.contains(cursor)) {
            streak += 1;
            cursor = cursor.minusDays(1);
        }
        return streak;
    }

    private static int longestStreak(List<LocalDate> dates) {
        int longest = 0;
        int current = 0;
        LocalDate previous = null;
        for (LocalDate date : dates) {
            current = previous != null && date.equals(previous.plusDays(1))
                    ? current + 1 : 1;
            longest = Math.max(longest, current);
            previous = date;
        }
        return longest;
    }

    private static long resolvedTotal(ConversationMessage message) {
        long detailed = (long) message.getInputTokens()
                + message.getOutputTokens()
                + message.getReasoningTokens()
                + message.getCacheReadTokens()
                + message.getCacheWriteTokens();
        return detailed > 0 ? detailed : Math.max(0, message.getTotalTokens());
    }

    private static final class MutableUsage {
        private long prompt;
        private long completion;
        private long total;
        private long input;
        private long output;
        private long reasoning;
        private long cacheRead;
        private long cacheWrite;
        private boolean cacheAvailable;

        void add(ConversationMessage message) {
            prompt += message.getPromptTokens();
            completion += message.getCompletionTokens();
            total += message.getTotalTokens();
            input += message.getInputTokens();
            output += message.getOutputTokens();
            reasoning += message.getReasoningTokens();
            cacheRead += message.getCacheReadTokens();
            cacheWrite += message.getCacheWriteTokens();
            cacheAvailable |= message.isCacheMetricsAvailable();
        }

        long normalizedTotal() {
            long detailed = input + output + reasoning + cacheRead + cacheWrite;
            return detailed > 0 ? detailed : total;
        }

        AggregateTokenUsage toModel() {
            return new AggregateTokenUsage(
                    prompt, completion, normalizedTotal(), input, output,
                    reasoning, cacheRead, cacheWrite, cacheAvailable
            );
        }
    }
}
