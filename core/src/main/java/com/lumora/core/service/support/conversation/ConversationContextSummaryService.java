package com.lumora.core.service.support.conversation;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.lumora.core.entity.ConversationContextSummary;
import com.lumora.core.mapper.ConversationContextSummaryMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ConversationContextSummaryService {
    private final ConversationContextSummaryMapper mapper;
    private final Clock clock;

    public ConversationContextSummary latest(String conversationId) {
        List<ConversationContextSummary> summaries = mapper.selectList(
                Wrappers.<ConversationContextSummary>lambdaQuery()
                        .eq(ConversationContextSummary::getConversationId,
                                conversationId)
                        .eq(ConversationContextSummary::getStatus, "ACTIVE")
                        .orderByDesc(ConversationContextSummary::getVersion)
                        .last("LIMIT 1")
        );
        return summaries.isEmpty() ? null : summaries.get(0);
    }

    @Transactional
    public ConversationContextSummary persist(String conversationId,
            String summary, int throughSequence, int beforeTokens,
            int afterTokens) {
        if (summary == null || summary.isBlank() || throughSequence < 1) {
            throw new IllegalArgumentException("上下文摘要内容或边界无效");
        }
        ConversationContextSummary previous = latest(conversationId);
        int version = previous == null ? 1 : previous.getVersion() + 1;
        ConversationContextSummary created = new ConversationContextSummary(
                UUID.randomUUID().toString(), conversationId, version, 1,
                throughSequence, summary.trim(), beforeTokens, afterTokens,
                "ACTIVE", clock.instant()
        );
        mapper.insert(created);
        return created;
    }
}
