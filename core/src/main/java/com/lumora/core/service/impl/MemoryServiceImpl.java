package com.lumora.core.service.impl;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lumora.core.entity.MemoryItem;
import com.lumora.core.entity.MemoryScopeType;
import com.lumora.core.entity.MemoryStatus;
import com.lumora.core.entity.MemoryType;
import com.lumora.core.mapper.MemoryItemMapper;
import com.lumora.core.model.MemoryWriteRequest;
import com.lumora.core.service.MemoryService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.text.Normalizer;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.Locale;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class MemoryServiceImpl implements MemoryService {

    private static final String LOCAL_USER_SCOPE_ID = "local-user";
    private static final int MAX_MEMORY_CONTENT_LENGTH = 4_000;
    private static final int MAX_STRUCTURED_DATA_LENGTH = 16_000;
    private static final int MAX_PROMPT_MEMORIES = 12;
    private static final int MAX_PROMPT_SUMMARY_LENGTH = 8_000;
    private static final Pattern DEDUPE_KEY_PATTERN = Pattern.compile(
            "^[a-z0-9][a-z0-9._-]{0,239}$"
    );

    private final MemoryItemMapper memoryItemMapper;
    private final Clock clock;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional
    public MemoryItem remember(MemoryWriteRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("记忆内容不能为空");
        }
        MemoryScopeType scopeType = requireValue(
                request.getScopeType(),
                "记忆范围"
        );
        MemoryType memoryType = requireValue(
                request.getMemoryType(),
                "记忆类型"
        );
        String scopeId = normalizeScopeId(scopeType, request.getScopeId());
        String content = requireText(request.getContent(), "记忆内容");
        if (content.length() > MAX_MEMORY_CONTENT_LENGTH) {
            throw new IllegalArgumentException("单条记忆内容超过限制");
        }
        String structuredData = normalizeStructuredData(
                request.getStructuredDataJson()
        );
        double confidence = request.getConfidence();
        if (!Double.isFinite(confidence)
                || confidence < 0.0
                || confidence > 1.0) {
            throw new IllegalArgumentException("记忆置信度必须在 0 到 1 之间");
        }
        String contentHash = sha256(content);
        String dedupeKey = normalizeDedupeKey(request.getDedupeKey());
        String subject = requireText(request.getSubject(), "记忆主体");
        String predicate = requireText(request.getPredicate(), "记忆属性");
        String value = requireText(request.getValue(), "记忆值");
        Instant now = clock.instant();
        MemoryItem semanticSlot = findSemanticSlot(
                scopeType,
                scopeId,
                memoryType,
                dedupeKey
        );
        if (semanticSlot != null) {
            boolean valueChanged = !canonicalValue(semanticSlot.getValue())
                    .equals(canonicalValue(value));
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
            boolean valueChanged = !canonicalValue(targetedMemory.getValue())
                    .equals(canonicalValue(value));
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
                blankToNull(request.getSourceMessageId()),
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
        List<MemoryItem> selected = selectPromptMemories(conversationId);
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
        List<String> lines = selectPromptMemories(conversationId).stream()
                .map(item -> String.join("; ",
                        "id=" + item.getMemoryId(),
                        "scope=" + item.getScopeType(),
                        "type=" + item.getMemoryType(),
                        "key=" + safe(item.getDedupeKey()),
                        "subject=" + safe(item.getSubject()),
                        "predicate=" + safe(item.getPredicate()),
                        "value=" + safe(item.getValue()),
                        "content=" + item.getContent()
                ))
                .toList();
        return lines.isEmpty() ? null : String.join("\n", lines);
    }

    @Override
    @Transactional
    public void archive(String memoryId) {
        MemoryItem memory = memoryItemMapper.selectById(
                requireText(memoryId, "记忆 ID")
        );
        if (memory == null) {
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
        return memoryItemMapper.selectList(
                Wrappers.<MemoryItem>lambdaQuery()
                        .eq(MemoryItem::getScopeType, scopeType)
                        .eq(MemoryItem::getScopeId, scopeId)
                        .eq(MemoryItem::getStatus, MemoryStatus.ACTIVE)
        );
    }

    private List<MemoryItem> selectPromptMemories(String conversationId) {
        String normalizedConversationId = requireText(
                conversationId,
                "会话 ID"
        );
        Instant now = clock.instant();
        Map<String, MemoryItem> candidates = new LinkedHashMap<>();
        loadActive(MemoryScopeType.USER, LOCAL_USER_SCOPE_ID).forEach(
                item -> candidates.put(item.getMemoryId(), item)
        );
        loadActive(MemoryScopeType.CONVERSATION, normalizedConversationId)
                .forEach(item -> candidates.put(item.getMemoryId(), item));
        return candidates.values().stream()
                .filter(item -> item.getExpiresAt() == null
                        || item.getExpiresAt().isAfter(now))
                .sorted(Comparator
                        .comparingDouble(MemoryItem::getConfidence)
                        .reversed()
                        .thenComparing(
                                MemoryItem::getUpdatedAt,
                                Comparator.reverseOrder()
                        ))
                .limit(MAX_PROMPT_MEMORIES)
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

    private MemoryItem findValidatedTarget(
            String targetMemoryId,
            MemoryScopeType scopeType,
            String scopeId,
            MemoryType memoryType,
            String dedupeKey
    ) {
        String normalizedId = blankToNull(targetMemoryId);
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
        existing.setSourceMessageId(blankToNull(request.getSourceMessageId()));
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

    private static String normalizeDedupeKey(String value) {
        String normalized = requireText(value, "记忆去重键")
                .toLowerCase(Locale.ROOT);
        if (!DEDUPE_KEY_PATTERN.matcher(normalized).matches()) {
            throw new IllegalArgumentException("记忆去重键格式无效");
        }
        return normalized;
    }

    private static String canonicalValue(String value) {
        if (value == null) {
            return "";
        }
        return Normalizer.normalize(value, Normalizer.Form.NFKC)
                .trim()
                .toLowerCase(Locale.ROOT)
                .replaceAll("\\s+", " ");
    }

    private String normalizeScopeId(
            MemoryScopeType scopeType,
            String scopeId
    ) {
        if (scopeType == MemoryScopeType.USER
                && (scopeId == null || scopeId.isBlank())) {
            return LOCAL_USER_SCOPE_ID;
        }
        return requireText(scopeId, "记忆范围 ID");
    }

    private String normalizeStructuredData(String value) {
        String normalized = value == null || value.isBlank()
                ? "{}"
                : value.trim();
        if (normalized.length() > MAX_STRUCTURED_DATA_LENGTH) {
            throw new IllegalArgumentException("记忆结构化数据超过限制");
        }
        try {
            JsonNode parsed = objectMapper.readTree(normalized);
            if (!parsed.isObject()) {
                throw new IllegalArgumentException("记忆结构化数据必须是 JSON 对象");
            }
        } catch (JsonProcessingException error) {
            throw new IllegalArgumentException("记忆结构化数据不是有效 JSON", error);
        }
        return normalized;
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

    private static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(
                    digest.digest(value.getBytes(StandardCharsets.UTF_8))
            );
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("当前运行时不支持 SHA-256", error);
        }
    }

    private static String requireText(String value, String label) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(label + "不能为空");
        }
        return value.trim();
    }

    private static <T> T requireValue(T value, String label) {
        if (value == null) {
            throw new IllegalArgumentException(label + "不能为空");
        }
        return value;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String safe(String value) {
        return value == null ? "" : value.replace("\n", " ").trim();
    }
}
