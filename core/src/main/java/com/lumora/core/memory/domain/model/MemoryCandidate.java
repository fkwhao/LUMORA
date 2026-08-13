package com.lumora.core.memory.domain.model;

import java.util.Map;

public class MemoryCandidate {

    private final String scope;
    private final String type;
    private final String retention;
    private final String content;
    private final String dedupeKey;
    private final String subject;
    private final String predicate;
    private final String value;
    private final String targetMemoryId;
    private final Map<String, Object> structuredData;
    private final double confidence;
    private final double importance;
    private final Long ttlSeconds;
    private final String action;
    private final String storage;

    public MemoryCandidate(
            String scope,
            String type,
            String retention,
            String content,
            String dedupeKey,
            String subject,
            String predicate,
            String value,
            String targetMemoryId,
            Map<String, Object> structuredData,
            double confidence,
            double importance,
            Long ttlSeconds,
            String action,
            String storage
    ) {
        this.scope = scope;
        this.type = type;
        this.retention = retention;
        this.content = content;
        this.dedupeKey = dedupeKey;
        this.subject = subject;
        this.predicate = predicate;
        this.value = value;
        this.targetMemoryId = targetMemoryId;
        this.structuredData = structuredData == null
                ? Map.of()
                : Map.copyOf(structuredData);
        this.confidence = confidence;
        this.importance = importance;
        this.ttlSeconds = ttlSeconds;
        this.action = action == null ? "UPSERT" : action;
        this.storage = storage == null ? "MEMORY" : storage;
    }

    public MemoryCandidate(
            String scope,
            String type,
            String retention,
            String content,
            String dedupeKey,
            String subject,
            String predicate,
            String value,
            String targetMemoryId,
            Map<String, Object> structuredData,
            double confidence,
            double importance,
            Long ttlSeconds
    ) {
        this(scope, type, retention, content, dedupeKey, subject, predicate,
                value, targetMemoryId, structuredData, confidence, importance,
                ttlSeconds, "UPSERT", "MEMORY");
    }

    public MemoryCandidate(
            String scope,
            String type,
            String retention,
            String content,
            String dedupeKey,
            String subject,
            String predicate,
            String value,
            String targetMemoryId,
            Map<String, Object> structuredData,
            double confidence,
            Long ttlSeconds
    ) {
        this(scope, type, retention, content, dedupeKey, subject, predicate,
                value, targetMemoryId, structuredData, confidence, 0.5,
                ttlSeconds);
    }

    public String getScope() { return scope; }
    public String getType() { return type; }
    public String getRetention() { return retention; }
    public String getContent() { return content; }
    public String getDedupeKey() { return dedupeKey; }
    public String getSubject() { return subject; }
    public String getPredicate() { return predicate; }
    public String getValue() { return value; }
    public String getTargetMemoryId() { return targetMemoryId; }
    public Map<String, Object> getStructuredData() { return structuredData; }
    public double getConfidence() { return confidence; }
    public double getImportance() { return importance; }
    public Long getTtlSeconds() { return ttlSeconds; }
    public String getAction() { return action; }
    public String getStorage() { return storage; }
}
