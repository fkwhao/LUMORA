package com.lumora.core.memory.application.support;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lumora.core.memory.domain.model.MemoryCandidate;
import com.lumora.core.memory.application.model.MemoryExtractionBatch;
import com.lumora.core.memory.application.model.MemoryExtractionOutcome;
import com.lumora.core.shared.config.CoreProperties;
import com.lumora.core.memory.domain.model.MemoryScopeType;
import com.lumora.core.memory.domain.model.MemoryType;
import com.lumora.core.memory.domain.model.MemoryWriteRequest;
import com.lumora.core.memory.application.service.MemoryService;
import com.lumora.core.memory.application.port.MemoryExtractionPort;
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
    private static final Pattern EXISTING_MEMORY_ID = Pattern.compile(
            "(?m)^id=([A-Za-z0-9_-]{1,100});"
    );

    private final MemoryExtractionPort memoryExtractionPort;
    private final MemoryService memoryService;
    private final ObjectMapper objectMapper;
    private final Clock clock;
    private final CoreProperties coreProperties;
    private final ProjectInstructionService projectInstructionService;

    public int extractAndStore(
            String conversationId,
            String sourceMessageId,
            String userMessage,
            String assistantMessage,
            String existingMemorySummary,
            String correlationId
    ) {
        return extractStoreAndReport(conversationId, null, sourceMessageId,
                userMessage, assistantMessage, existingMemorySummary,
                correlationId).storedCount();
    }

    public int extractAndStore(
            String conversationId,
            String projectScopeId,
            String sourceMessageId,
            String userMessage,
            String assistantMessage,
            String existingMemorySummary,
            String correlationId
    ) {
        return extractStoreAndReport(
                conversationId,
                projectScopeId,
                sourceMessageId,
                userMessage,
                assistantMessage,
                existingMemorySummary,
                correlationId
        ).storedCount();
    }

    public MemoryExtractionOutcome extractStoreAndReport(
            String conversationId,
            String projectScopeId,
            String sourceMessageId,
            String userMessage,
            String assistantMessage,
            String existingMemorySummary,
            String correlationId
    ) {
        if (!coreProperties.isMemoryAutoExtractionEnabled()
                || !memoryService.isEnabled()) {
            return MemoryExtractionOutcome.empty();
        }
        MemoryExtractionBatch extraction = memoryExtractionPort.extractMemories(
                userMessage,
                assistantMessage,
                existingMemorySummary,
                projectScopeId,
                correlationId
        );
        List<MemoryCandidate> candidates = extraction.candidates();
        int stored = 0;
        Set<String> claimedTargetIds = new HashSet<>();
        Set<String> archivedTargetIds = new HashSet<>();
        Set<String> allowedTargetIds = existingMemoryIds(
                existingMemorySummary
        );
        for (MemoryCandidate candidate : candidates) {
            try {
                if ("PROJECT_INSTRUCTIONS".equals(candidate.getStorage())) {
                    if (applyProjectInstruction(candidate, projectScopeId)) {
                        stored++;
                    }
                    continue;
                }
                if (archiveMemory(
                        candidate,
                        conversationId,
                        projectScopeId,
                        claimedTargetIds,
                        archivedTargetIds,
                        allowedTargetIds
                )) {
                    stored++;
                    continue;
                }
                if (candidate.getTargetMemoryId() != null
                        && archivedTargetIds.contains(
                        candidate.getTargetMemoryId()
                )) {
                    continue;
                }
                MemoryWriteRequest request = toWriteRequest(
                        candidate,
                        conversationId,
                        projectScopeId,
                        sourceMessageId,
                        claimedTargetIds
                );
                if (request != null) {
                    memoryService.remember(request);
                    stored++;
                }
            } catch (IllegalArgumentException | JsonProcessingException error) {
                LOGGER.warn("忽略无效记忆候选: {}", error.getMessage());
            } catch (RuntimeException error) {
                // Candidate storage is best-effort; provider usage is still billable.
                LOGGER.warn("保存记忆候选失败", error);
            }
        }
        return new MemoryExtractionOutcome(
                stored,
                extraction.model(),
                extraction.usage()
        );
    }

    private MemoryWriteRequest toWriteRequest(
            MemoryCandidate candidate,
            String conversationId,
            String projectScopeId,
            String sourceMessageId,
            Set<String> claimedTargetIds
    ) throws JsonProcessingException {
        if (!"UPSERT".equals(candidate.getAction())
                || !"MEMORY".equals(candidate.getStorage())) {
            throw new IllegalArgumentException("未知记忆候选操作");
        }
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
        if (shortTerm && scopeType != MemoryScopeType.CONVERSATION) {
            throw new IllegalArgumentException("短期记忆只能属于当前会话");
        }
        if (scopeType == MemoryScopeType.PROJECT
                && (projectScopeId == null || projectScopeId.isBlank())) {
            throw new IllegalArgumentException("项目记忆缺少工作区范围");
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
                switch (scopeType) {
                    case USER -> null;
                    case PROJECT -> projectScopeId;
                    case CONVERSATION -> conversationId;
                },
                memoryType,
                content,
                requireText(candidate.getDedupeKey(), "记忆去重键"),
                requireText(candidate.getSubject(), "记忆主体"),
                requireText(candidate.getPredicate(), "记忆属性"),
                requireText(candidate.getValue(), "记忆值"),
                targetMemoryId,
                objectMapper.writeValueAsString(candidate.getStructuredData()),
                candidate.getConfidence(),
                candidate.getImportance(),
                "CONVERSATION_EXTRACTION",
                conversationId + ":" + sourceMessageId,
                sourceMessageId,
                expiresAt
        );
    }

    private boolean applyProjectInstruction(
            MemoryCandidate candidate,
            String projectScopeId
    ) {
        if (!"LONG_TERM".equals(candidate.getRetention())
                || !"PROJECT".equals(candidate.getScope())
                || !("CONSTRAINT".equals(candidate.getType())
                || "DECISION".equals(candidate.getType()))) {
            throw new IllegalArgumentException("项目指令候选的范围或类型无效");
        }
        if (candidate.getConfidence() < LONG_TERM_CONFIDENCE) {
            return false;
        }
        String content = requireText(candidate.getContent(), "项目指令内容");
        if (SECRET_ASSIGNMENT.matcher(content).find()) {
            throw new IllegalArgumentException("项目指令候选包含认证秘密");
        }
        return projectInstructionService.apply(
                requireText(projectScopeId, "项目指令工作区"),
                requireAction(candidate.getAction()),
                requireText(candidate.getDedupeKey(), "项目指令去重键"),
                content
        );
    }

    private boolean archiveMemory(
            MemoryCandidate candidate,
            String conversationId,
            String projectScopeId,
            Set<String> claimedTargetIds,
            Set<String> archivedTargetIds,
            Set<String> allowedTargetIds
    ) {
        if (!"ARCHIVE".equals(candidate.getAction())) {
            return false;
        }
        if (!"MEMORY".equals(candidate.getStorage())) {
            throw new IllegalArgumentException("未知记忆归档存储类型");
        }
        boolean shortTerm = "SHORT_TERM".equals(candidate.getRetention());
        boolean longTerm = "LONG_TERM".equals(candidate.getRetention());
        if (!shortTerm && !longTerm) {
            throw new IllegalArgumentException("未知记忆保留策略");
        }
        double threshold = shortTerm
                ? SHORT_TERM_CONFIDENCE
                : LONG_TERM_CONFIDENCE;
        if (candidate.getConfidence() < threshold) {
            return false;
        }
        MemoryScopeType scopeType = MemoryScopeType.valueOf(
                requireText(candidate.getScope(), "记忆范围")
        );
        if (shortTerm && scopeType != MemoryScopeType.CONVERSATION) {
            throw new IllegalArgumentException("短期记忆只能属于当前会话");
        }
        String targetMemoryId = requireText(
                candidate.getTargetMemoryId(), "待归档记忆 ID"
        );
        if (!claimedTargetIds.add(targetMemoryId)) {
            throw new IllegalArgumentException("同一记忆被重复操作");
        }
        if (!allowedTargetIds.contains(targetMemoryId)) {
            throw new IllegalArgumentException("待归档记忆不在当前提取上下文");
        }
        String scopeId = switch (scopeType) {
            case USER -> null;
            case PROJECT -> requireText(projectScopeId, "项目记忆工作区");
            case CONVERSATION -> conversationId;
        };
        memoryService.archive(
                targetMemoryId,
                scopeType,
                scopeId
        );
        archivedTargetIds.add(targetMemoryId);
        return true;
    }

    private static Set<String> existingMemoryIds(String context) {
        if (context == null || context.isBlank()) {
            return Set.of();
        }
        Set<String> ids = new HashSet<>();
        var matcher = EXISTING_MEMORY_ID.matcher(context);
        while (matcher.find()) {
            ids.add(matcher.group(1));
        }
        return Set.copyOf(ids);
    }

    private static String requireAction(String value) {
        if (!"UPSERT".equals(value) && !"ARCHIVE".equals(value)) {
            throw new IllegalArgumentException("未知候选操作");
        }
        return value;
    }

    private long resolveTtl(MemoryCandidate candidate) {
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
