package com.lumora.core.service.impl;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.lumora.core.entity.ApplicationSetting;
import com.lumora.core.entity.MemoryItem;
import com.lumora.core.entity.MemoryScopeType;
import com.lumora.core.entity.MemoryStatus;
import com.lumora.core.entity.MemoryType;
import com.lumora.core.mapper.ApplicationSettingMapper;
import com.lumora.core.mapper.MemoryItemMapper;
import com.lumora.core.model.MemoryWriteRequest;
import com.lumora.core.model.MemoryContextItem;
import com.lumora.core.model.MemorySettings;
import com.lumora.core.service.MemoryService;
import com.lumora.core.service.support.memory.MemoryValueNormalizer;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class MemoryServiceImpl implements MemoryService {

    private static final int MAX_MEMORY_CONTENT_LENGTH = 4_000;
    private static final int MAX_PROMPT_MEMORIES = 12;
    private static final int MAX_CANDIDATES_PER_SCOPE = 20;
    private static final int MAX_ARCHIVED_EXTRACTION_MEMORIES_PER_SCOPE = 8;
    private static final int MAX_PROMPT_SUMMARY_LENGTH = 8_000;
    private static final int MAX_EXTRACTION_CONTEXT_LENGTH = 20_000;
    private static final String MEMORY_ENABLED_KEY = "memory.enabled";
    private final MemoryItemMapper memoryItemMapper;
    private final ApplicationSettingMapper applicationSettingMapper;
    private final Clock clock;
    private final MemoryValueNormalizer normalizer;

    @Override
    public MemorySettings getSettings() {
        return new MemorySettings(isEnabled());
    }

    @Override
    @Transactional
    public MemorySettings updateSettings(boolean enabled) {
        Instant now = clock.instant();
        ApplicationSetting setting = applicationSettingMapper.selectById(
                MEMORY_ENABLED_KEY
        );
        if (setting == null) {
            applicationSettingMapper.insert(new ApplicationSetting(
                    MEMORY_ENABLED_KEY,
                    Boolean.toString(enabled),
                    now,
                    now
            ));
        } else {
            setting.setSettingValue(Boolean.toString(enabled));
            setting.setUpdatedAt(now);
            applicationSettingMapper.updateById(setting);
        }
        return new MemorySettings(enabled);
    }

    @Override
    public boolean isEnabled() {
        ApplicationSetting setting = applicationSettingMapper.selectById(
                MEMORY_ENABLED_KEY
        );
        return setting == null
                || Boolean.parseBoolean(setting.getSettingValue());
    }

    @Override
    @Transactional
    public int reset() {
        return memoryItemMapper.deleteAllMemories();
    }

    @Override
    @Transactional
    public MemoryItem remember(MemoryWriteRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("记忆内容不能为空");
        }
        MemoryScopeType scopeType = normalizer.requireValue(
                request.getScopeType(),
                "记忆范围"
        );
        MemoryType memoryType = normalizer.requireValue(
                request.getMemoryType(),
                "记忆类型"
        );
        String scopeId = normalizer.normalizeScopeId(
                scopeType,
                request.getScopeId()
        );
        String content = normalizer.requireText(
                request.getContent(),
                "记忆内容"
        );
        if (content.length() > MAX_MEMORY_CONTENT_LENGTH) {
            throw new IllegalArgumentException("单条记忆内容超过限制");
        }
        String structuredData = normalizer.normalizeStructuredData(
                request.getStructuredDataJson()
        );
        double confidence = request.getConfidence();
        if (!Double.isFinite(confidence)
                || confidence < 0.0
                || confidence > 1.0) {
            throw new IllegalArgumentException("记忆置信度必须在 0 到 1 之间");
        }
        double importance = request.getImportance();
        if (!Double.isFinite(importance)
                || importance < 0.0
                || importance > 1.0) {
            throw new IllegalArgumentException("记忆重要度必须在 0 到 1 之间");
        }
        String contentHash = normalizer.sha256(content);
        String dedupeKey = normalizer.normalizeDedupeKey(
                request.getDedupeKey()
        );
        String subject = normalizer.requireText(
                request.getSubject(),
                "记忆主体"
        );
        String predicate = normalizer.requireText(
                request.getPredicate(),
                "记忆属性"
        );
        String value = normalizer.requireText(request.getValue(), "记忆值");
        Instant now = clock.instant();
        MemoryItem semanticSlot = findSemanticSlot(
                scopeType,
                scopeId,
                memoryType,
                dedupeKey
        );
        boolean restoringArchived = false;
        if (semanticSlot == null) {
            semanticSlot = findLatestArchivedSemanticSlot(
                    scopeType,
                    scopeId,
                    memoryType,
                    dedupeKey
            );
            restoringArchived = semanticSlot != null;
        }
        if (semanticSlot != null) {
            boolean valueChanged = restoringArchived
                    || !normalizer.canonicalValue(
                    semanticSlot.getValue()
            ).equals(normalizer.canonicalValue(value));
            updateExisting(
                    semanticSlot,
                    request,
                    content,
                    structuredData,
                    contentHash,
                    dedupeKey,
                    subject,
                    predicate,
                    value,
                    valueChanged,
                    now
            );
            return semanticSlot;
        }
        MemoryItem targetedMemory = findValidatedTarget(
                request.getTargetMemoryId(),
                scopeType,
                scopeId,
                memoryType,
                dedupeKey
        );
        if (targetedMemory != null) {
            boolean valueChanged = !normalizer.canonicalValue(
                    targetedMemory.getValue()
            ).equals(normalizer.canonicalValue(value));
            updateExisting(
                    targetedMemory,
                    request,
                    content,
                    structuredData,
                    contentHash,
                    dedupeKey,
                    subject,
                    predicate,
                    value,
                    valueChanged,
                    now
            );
            return targetedMemory;
        }
        MemoryItem existing = findDuplicate(
                scopeType,
                scopeId,
                memoryType,
                contentHash
        );
        if (existing != null) {
            updateExisting(
                    existing,
                    request,
                    content,
                    structuredData,
                    contentHash,
                    dedupeKey,
                    subject,
                    predicate,
                    value,
                    false,
                    now
            );
            return existing;
        }
        MemoryItem created = new MemoryItem(
                UUID.randomUUID().toString(),
                scopeType,
                scopeId,
                memoryType,
                content,
                structuredData,
                confidence,
                importance,
                0,
                null,
                normalizer.requireText(request.getSourceType(), "记忆来源类型"),
                normalizer.blankToNull(request.getSourceReference()),
                normalizer.blankToNull(request.getSourceMessageId()),
                contentHash,
                dedupeKey,
                subject,
                predicate,
                value,
                1,
                MemoryStatus.ACTIVE,
                request.getExpiresAt(),
                now,
                now
        );
        memoryItemMapper.insert(created);
        return created;
    }

    @Override
    public String buildPromptSummary(String conversationId) {
        if (!isEnabled()) {
            return null;
        }
        List<MemoryItem> selected = selectPromptMemories(conversationId, null)
                .stream()
                .limit(MAX_PROMPT_MEMORIES)
                .toList();
        if (selected.isEmpty()) {
            return null;
        }
        List<String> lines = new ArrayList<>();
        int usedCharacters = 0;
        for (MemoryItem item : selected) {
            String slot = item.getDedupeKey() == null
                    || item.getDedupeKey().isBlank()
                    ? ""
                    : "[key=" + item.getDedupeKey() + "]";
            String line = "- [" + label(item.getMemoryType()) + "]"
                    + slot + " "
                    + item.getContent();
            if (usedCharacters + line.length() > MAX_PROMPT_SUMMARY_LENGTH) {
                break;
            }
            lines.add(line);
            usedCharacters += line.length();
        }
        return lines.isEmpty() ? null : String.join("\n", lines);
    }

    @Override
    public String buildExtractionContext(String conversationId) {
        return buildExtractionContext(conversationId, null);
    }

    @Override
    public String buildExtractionContext(
            String conversationId,
            String workspacePath
    ) {
        if (!isEnabled()) {
            return null;
        }
        List<String> lines = new ArrayList<>();
        int usedCharacters = 0;
        for (MemoryItem item : selectExtractionMemories(
                conversationId, workspacePath
        )) {
            String line = String.join("; ",
                    "id=" + item.getMemoryId(),
                    "status=" + item.getStatus(),
                    "scope=" + item.getScopeType(),
                    "type=" + item.getMemoryType(),
                    "key=" + safe(item.getDedupeKey()),
                    "subject=" + safe(item.getSubject()),
                    "predicate=" + safe(item.getPredicate()),
                    "value=" + safe(item.getValue()),
                    "content=" + safe(item.getContent())
            );
            int separatorLength = lines.isEmpty() ? 0 : 1;
            if (usedCharacters + separatorLength + line.length()
                    > MAX_EXTRACTION_CONTEXT_LENGTH) {
                break;
            }
            lines.add(line);
            usedCharacters += separatorLength + line.length();
        }
        return lines.isEmpty() ? null : String.join("\n", lines);
    }

    private List<MemoryItem> selectExtractionMemories(
            String conversationId,
            String workspacePath
    ) {
        List<MemoryItem> selected = new ArrayList<>(selectPromptMemories(
                conversationId, workspacePath
        ));
        String userScopeId = normalizer.normalizeScopeId(
                MemoryScopeType.USER, null
        );
        selected.addAll(loadRecentArchived(
                MemoryScopeType.USER, userScopeId
        ));
        String projectScopeId = normalizer.normalizeProjectScopeId(
                workspacePath
        );
        if (projectScopeId != null) {
            selected.addAll(loadRecentArchived(
                    MemoryScopeType.PROJECT, projectScopeId
            ));
        }
        selected.addAll(loadRecentArchived(
                MemoryScopeType.CONVERSATION,
                normalizer.requireText(conversationId, "会话 ID")
        ));
        return selected;
    }

    private List<MemoryItem> loadRecentArchived(
            MemoryScopeType scopeType,
            String scopeId
    ) {
        return memoryItemMapper.selectList(
                Wrappers.<MemoryItem>lambdaQuery()
                        .eq(MemoryItem::getScopeType, scopeType)
                        .eq(MemoryItem::getScopeId, scopeId)
                        .eq(MemoryItem::getStatus, MemoryStatus.ARCHIVED)
                        .orderByDesc(MemoryItem::getUpdatedAt)
                        .last("LIMIT "
                                + MAX_ARCHIVED_EXTRACTION_MEMORIES_PER_SCOPE)
        );
    }

    @Override
    public List<MemoryContextItem> buildPromptCandidates(
            String conversationId,
            String workspacePath
    ) {
        if (!isEnabled()) {
            return List.of();
        }
        return selectPromptMemories(conversationId, workspacePath).stream()
                .map(item -> new MemoryContextItem(
                        item.getMemoryId(), item.getScopeType(),
                        item.getMemoryType(), item.getContent(),
                        item.getImportance(), item.getConfidence(),
                        item.getUsageCount(), item.getLastUsedAt(),
                        item.getUpdatedAt()
                ))
                .toList();
    }

    @Override
    public String resolveProjectScopeId(String workspacePath) {
        return normalizer.normalizeProjectScopeId(workspacePath);
    }

    @Override
    @Transactional
    public void markUsed(List<String> memoryIds) {
        if (memoryIds == null || memoryIds.isEmpty()) {
            return;
        }
        Instant now = clock.instant();
        memoryIds.stream().filter(id -> id != null && !id.isBlank())
                .distinct().forEach(id -> {
                    MemoryItem item = memoryItemMapper.selectById(id);
                    if (item != null && item.getStatus() == MemoryStatus.ACTIVE) {
                        item.setUsageCount(Math.max(0, item.getUsageCount()) + 1);
                        item.setLastUsedAt(now);
                        memoryItemMapper.updateById(item);
                    }
                });
    }

    @Override
    @Transactional
    public void archive(
            String memoryId,
            MemoryScopeType scopeType,
            String scopeId
    ) {
        MemoryScopeType normalizedScope = normalizer.requireValue(
                scopeType, "记忆范围"
        );
        String normalizedId = normalizer.requireText(memoryId, "记忆 ID");
        String normalizedScopeId = normalizedScope == MemoryScopeType.PROJECT
                ? normalizer.normalizeProjectScopeId(scopeId)
                : normalizer.normalizeScopeId(normalizedScope, scopeId);
        MemoryItem memory = memoryItemMapper.selectById(normalizedId);
        if (memory == null
                || memory.getStatus() != MemoryStatus.ACTIVE
                || memory.getScopeType() != normalizedScope
                || !normalizedScopeId.equals(memory.getScopeId())) {
            throw new IllegalArgumentException("记忆不存在");
        }
        memory.setStatus(MemoryStatus.ARCHIVED);
        memory.setUpdatedAt(clock.instant());
        memoryItemMapper.updateById(memory);
    }

    private List<MemoryItem> loadActive(
            MemoryScopeType scopeType,
            String scopeId
    ) {
        Instant now = clock.instant();
        List<MemoryItem> selected = memoryItemMapper.selectList(
                Wrappers.<MemoryItem>lambdaQuery()
                        .eq(MemoryItem::getScopeType, scopeType)
                        .eq(MemoryItem::getScopeId, scopeId)
                        .eq(MemoryItem::getStatus, MemoryStatus.ACTIVE)
                        .orderByDesc(MemoryItem::getImportance)
                        .orderByDesc(MemoryItem::getConfidence)
                        .orderByDesc(MemoryItem::getUpdatedAt)
                        .last("LIMIT " + MAX_CANDIDATES_PER_SCOPE)
        );
        selected.stream()
                .filter(item -> item.getExpiresAt() != null
                        && !item.getExpiresAt().isAfter(now))
                .forEach(item -> {
                    item.setStatus(MemoryStatus.EXPIRED);
                    item.setUpdatedAt(now);
                    memoryItemMapper.updateById(item);
                });
        return selected.stream()
                .filter(item -> item.getExpiresAt() == null
                        || item.getExpiresAt().isAfter(now))
                .toList();
    }

    private List<MemoryItem> selectPromptMemories(
            String conversationId,
            String workspacePath
    ) {
        String normalizedConversationId = normalizer.requireText(
                conversationId,
                "会话 ID"
        );
        Instant now = clock.instant();
        Map<String, MemoryItem> candidates = new LinkedHashMap<>();
        loadActive(
                MemoryScopeType.USER,
                normalizer.normalizeScopeId(MemoryScopeType.USER, null)
        ).forEach(
                item -> candidates.put(item.getMemoryId(), item)
        );
        String projectScopeId = normalizer.normalizeProjectScopeId(
                workspacePath
        );
        if (projectScopeId != null) {
            loadActive(MemoryScopeType.PROJECT, projectScopeId)
                    .forEach(item -> candidates.put(item.getMemoryId(), item));
        }
        loadActive(MemoryScopeType.CONVERSATION, normalizedConversationId)
                .forEach(item -> candidates.put(item.getMemoryId(), item));
        return candidates.values().stream()
                .filter(item -> item.getExpiresAt() == null
                        || item.getExpiresAt().isAfter(now))
                .sorted(Comparator
                        .comparingDouble(MemoryItem::getImportance)
                        .reversed()
                        .thenComparing(Comparator.comparingDouble(
                                MemoryItem::getConfidence
                        ).reversed())
                        .thenComparing(
                                MemoryItem::getUpdatedAt,
                                Comparator.reverseOrder()
                        ))
                .toList();
    }

    private MemoryItem findDuplicate(
            MemoryScopeType scopeType,
            String scopeId,
            MemoryType memoryType,
            String contentHash
    ) {
        return memoryItemMapper.selectOne(
                Wrappers.<MemoryItem>lambdaQuery()
                        .eq(MemoryItem::getScopeType, scopeType)
                        .eq(MemoryItem::getScopeId, scopeId)
                        .eq(MemoryItem::getMemoryType, memoryType)
                        .eq(MemoryItem::getContentHash, contentHash)
        );
    }

    private MemoryItem findSemanticSlot(
            MemoryScopeType scopeType,
            String scopeId,
            MemoryType memoryType,
            String dedupeKey
    ) {
        return memoryItemMapper.selectOne(
                Wrappers.<MemoryItem>lambdaQuery()
                        .eq(MemoryItem::getScopeType, scopeType)
                        .eq(MemoryItem::getScopeId, scopeId)
                        .eq(MemoryItem::getMemoryType, memoryType)
                        .eq(MemoryItem::getDedupeKey, dedupeKey)
                        .eq(MemoryItem::getStatus, MemoryStatus.ACTIVE)
        );
    }

    private MemoryItem findLatestArchivedSemanticSlot(
            MemoryScopeType scopeType,
            String scopeId,
            MemoryType memoryType,
            String dedupeKey
    ) {
        return memoryItemMapper.selectOne(
                Wrappers.<MemoryItem>lambdaQuery()
                        .eq(MemoryItem::getScopeType, scopeType)
                        .eq(MemoryItem::getScopeId, scopeId)
                        .eq(MemoryItem::getMemoryType, memoryType)
                        .eq(MemoryItem::getDedupeKey, dedupeKey)
                        .eq(MemoryItem::getStatus, MemoryStatus.ARCHIVED)
                        .orderByDesc(MemoryItem::getUpdatedAt)
                        .last("LIMIT 1")
        );
    }

    private MemoryItem findValidatedTarget(
            String targetMemoryId,
            MemoryScopeType scopeType,
            String scopeId,
            MemoryType memoryType,
            String dedupeKey
    ) {
        String normalizedId = normalizer.blankToNull(targetMemoryId);
        if (normalizedId == null) {
            return null;
        }
        MemoryItem target = memoryItemMapper.selectById(normalizedId);
        if (target == null
                || target.getStatus() != MemoryStatus.ACTIVE
                || target.getScopeType() != scopeType
                || !scopeId.equals(target.getScopeId())
                || target.getMemoryType() != memoryType
                || target.getDedupeKey() != null
                && !target.getDedupeKey().isBlank()
                && !dedupeKey.equals(target.getDedupeKey())) {
            throw new IllegalArgumentException("记忆合并目标无效");
        }
        return target;
    }

    private void updateExisting(
            MemoryItem existing,
            MemoryWriteRequest request,
            String content,
            String structuredData,
            String contentHash,
            String dedupeKey,
            String subject,
            String predicate,
            String value,
            boolean valueChanged,
            Instant now
    ) {
        existing.setContent(content);
        existing.setStructuredDataJson(structuredData);
        existing.setConfidence(Math.max(
                existing.getConfidence(),
                request.getConfidence()
        ));
        existing.setImportance(Math.max(
                existing.getImportance(),
                request.getImportance()
        ));
        existing.setSourceType(normalizer.requireText(
                request.getSourceType(), "记忆来源类型"
        ));
        existing.setSourceReference(normalizer.blankToNull(
                request.getSourceReference()
        ));
        existing.setSourceMessageId(normalizer.blankToNull(
                request.getSourceMessageId()
        ));
        existing.setContentHash(contentHash);
        existing.setDedupeKey(dedupeKey);
        existing.setSubject(subject);
        existing.setPredicate(predicate);
        existing.setValue(value);
        existing.setVersion(Math.max(1, existing.getVersion())
                + (valueChanged ? 1 : 0));
        existing.setStatus(MemoryStatus.ACTIVE);
        existing.setExpiresAt(request.getExpiresAt());
        existing.setUpdatedAt(now);
        memoryItemMapper.updateById(existing);
    }

    private static String label(MemoryType type) {
        return switch (type) {
            case PREFERENCE -> "偏好";
            case FACT -> "事实";
            case DECISION -> "决定";
            case CONSTRAINT -> "约束";
            case SUMMARY -> "摘要";
        };
    }

    private static String safe(String value) {
        return value == null ? "" : value.replace("\n", " ").trim();
    }
}
