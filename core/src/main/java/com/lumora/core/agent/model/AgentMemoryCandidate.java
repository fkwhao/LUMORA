package com.lumora.core.agent.model;

import java.util.Map;

public class AgentMemoryCandidate {

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
    private final Long ttlSeconds;

    public AgentMemoryCandidate(
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
        this.ttlSeconds = ttlSeconds;
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
    public Long getTtlSeconds() { return ttlSeconds; }
}
