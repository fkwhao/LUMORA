package com.lumora.core.service.support.memory;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lumora.core.agent.model.AgentMemoryCandidate;
import com.lumora.core.config.CoreProperties;
import com.lumora.core.entity.MemoryScopeType;
import com.lumora.core.entity.MemoryType;
import com.lumora.core.model.MemoryWriteRequest;
import com.lumora.core.service.MemoryService;
import com.lumora.core.service.ModelService;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class MemoryExtractionCoordinator {

    private static final Logger LOGGER = LoggerFactory.getLogger(
            MemoryExtractionCoordinator.class
    );
    private static final double SHORT_TERM_CONFIDENCE = 0.65;
    private static final double LONG_TERM_CONFIDENCE = 0.80;
    private static final long DEFAULT_SHORT_TERM_TTL_SECONDS = 604_800L;
    private static final long MAX_SHORT_TERM_TTL_SECONDS = 2_592_000L;
    private static final Pattern SECRET_ASSIGNMENT = Pattern.compile(
            "(?i)(api[_ -]?key|access[_ -]?token|password|密码|令牌)"
                    + "\\s*[:=：]\\s*\\S+"
    );

    private final ModelService modelService;
    private final MemoryService memoryService;
    private final ObjectMapper objectMapper;
    private final Clock clock;
    private final CoreProperties coreProperties;

    public int extractAndStore(
            String conversationId,
            String sourceMessageId,
            String userMessage,
            String assistantMessage,
            String existingMemorySummary,
            String correlationId
    ) {
        if (!coreProperties.isMemoryAutoExtractionEnabled()) {
            return 0;
        }
        List<AgentMemoryCandidate> candidates = modelService.extractMemories(
                userMessage,
                assistantMessage,
                existingMemorySummary,
                correlationId
        );
        int stored = 0;
        Set<String> claimedTargetIds = new HashSet<>();
        for (AgentMemoryCandidate candidate : candidates) {
            try {
                MemoryWriteRequest request = toWriteRequest(
                        candidate,
                        conversationId,
                        sourceMessageId,
                        claimedTargetIds
                );
                if (request != null) {
                    memoryService.remember(request);
                    stored++;
                }
            } catch (IllegalArgumentException | JsonProcessingException error) {
                LOGGER.warn("忽略无效记忆候选: {}", error.getMessage());
            }
        }
        return stored;
    }

    private MemoryWriteRequest toWriteRequest(
            AgentMemoryCandidate candidate,
            String conversationId,
            String sourceMessageId,
            Set<String> claimedTargetIds
    ) throws JsonProcessingException {
        boolean shortTerm = "SHORT_TERM".equals(candidate.getRetention());
        boolean longTerm = "LONG_TERM".equals(candidate.getRetention());
        if (!shortTerm && !longTerm) {
            throw new IllegalArgumentException("未知记忆保留策略");
        }
        double threshold = shortTerm
                ? SHORT_TERM_CONFIDENCE
                : LONG_TERM_CONFIDENCE;
        if (candidate.getConfidence() < threshold) {
            return null;
        }
        String content = requireText(candidate.getContent(), "记忆内容");
        if (SECRET_ASSIGNMENT.matcher(content).find()) {
            throw new IllegalArgumentException("记忆候选包含认证秘密");
        }
        MemoryScopeType scopeType = MemoryScopeType.valueOf(
                requireText(candidate.getScope(), "记忆范围")
        );
        if (scopeType == MemoryScopeType.PROJECT
                || shortTerm && scopeType != MemoryScopeType.CONVERSATION) {
            throw new IllegalArgumentException("当前阶段不支持该记忆范围");
        }
        MemoryType memoryType = MemoryType.valueOf(
                requireText(candidate.getType(), "记忆类型")
        );
        Instant expiresAt = shortTerm
                ? clock.instant().plusSeconds(resolveTtl(candidate))
                : null;
        String targetMemoryId = candidate.getTargetMemoryId();
        if (targetMemoryId != null
                && !targetMemoryId.isBlank()
                && !claimedTargetIds.add(targetMemoryId)) {
            // 一条旧的复合记忆可能被拆成多个独立候选，同一旧行只能被其中一个复用。
            targetMemoryId = null;
        }
        return new MemoryWriteRequest(
                scopeType,
                scopeType == MemoryScopeType.USER ? null : conversationId,
                memoryType,
                content,
                requireText(candidate.getDedupeKey(), "记忆去重键"),
                requireText(candidate.getSubject(), "记忆主体"),
                requireText(candidate.getPredicate(), "记忆属性"),
                requireText(candidate.getValue(), "记忆值"),
                targetMemoryId,
                objectMapper.writeValueAsString(candidate.getStructuredData()),
                candidate.getConfidence(),
                sourceMessageId,
                expiresAt
        );
    }

    private long resolveTtl(AgentMemoryCandidate candidate) {
        Long requested = candidate.getTtlSeconds();
        if (requested == null) {
            return DEFAULT_SHORT_TERM_TTL_SECONDS;
        }
        return Math.max(60L, Math.min(requested, MAX_SHORT_TERM_TTL_SECONDS));
    }

    private static String requireText(String value, String label) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(label + "不能为空");
        }
        return value.trim();
    }
}
