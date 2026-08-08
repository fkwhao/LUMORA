package com.lumora.core.memory.domain.model;

import com.lumora.core.memory.domain.model.MemoryScopeType;
import com.lumora.core.memory.domain.model.MemoryType;

import java.time.Instant;

public class MemoryWriteRequest {

    private final MemoryScopeType scopeType;
    private final String scopeId;
    private final MemoryType memoryType;
    private final String content;
    private final String dedupeKey;
    private final String subject;
    private final String predicate;
    private final String value;
    private final String targetMemoryId;
    private final String structuredDataJson;
    private final double confidence;
    private final double importance;
    private final String sourceType;
    private final String sourceReference;
    private final String sourceMessageId;
    private final Instant expiresAt;

    public MemoryWriteRequest(
            MemoryScopeType scopeType,
            String scopeId,
            MemoryType memoryType,
            String content,
            String dedupeKey,
            String subject,
            String predicate,
            String value,
            String targetMemoryId,
            String structuredDataJson,
            double confidence,
            double importance,
            String sourceType,
            String sourceReference,
            String sourceMessageId,
            Instant expiresAt
    ) {
        this.scopeType = scopeType;
        this.scopeId = scopeId;
        this.memoryType = memoryType;
        this.content = content;
        this.dedupeKey = dedupeKey;
        this.subject = subject;
        this.predicate = predicate;
        this.value = value;
        this.targetMemoryId = targetMemoryId;
        this.structuredDataJson = structuredDataJson;
        this.confidence = confidence;
        this.importance = importance;
        this.sourceType = sourceType;
        this.sourceReference = sourceReference;
        this.sourceMessageId = sourceMessageId;
        this.expiresAt = expiresAt;
    }

    public MemoryWriteRequest(
            MemoryScopeType scopeType,
            String scopeId,
            MemoryType memoryType,
            String content,
            String dedupeKey,
            String subject,
            String predicate,
            String value,
            String targetMemoryId,
            String structuredDataJson,
            double confidence,
            String sourceMessageId,
            Instant expiresAt
    ) {
        this(scopeType, scopeId, memoryType, content, dedupeKey, subject,
                predicate, value, targetMemoryId, structuredDataJson,
                confidence, 0.5, "LEGACY", sourceMessageId,
                sourceMessageId, expiresAt);
    }

    public MemoryScopeType getScopeType() {
        return scopeType;
    }

    public String getScopeId() {
        return scopeId;
    }

    public MemoryType getMemoryType() {
        return memoryType;
    }

    public String getContent() {
        return content;
    }

    public String getDedupeKey() { return dedupeKey; }
    public String getSubject() { return subject; }
    public String getPredicate() { return predicate; }
    public String getValue() { return value; }
    public String getTargetMemoryId() { return targetMemoryId; }

    public String getStructuredDataJson() {
        return structuredDataJson;
    }

    public double getConfidence() {
        return confidence;
    }

    public double getImportance() { return importance; }
    public String getSourceType() { return sourceType; }
    public String getSourceReference() { return sourceReference; }

    public String getSourceMessageId() {
        return sourceMessageId;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }
}
