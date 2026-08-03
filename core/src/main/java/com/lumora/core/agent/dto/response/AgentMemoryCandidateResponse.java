package com.lumora.core.agent.dto.response;

import java.util.Map;

public class AgentMemoryCandidateResponse {

    private String scope;
    private String type;
    private String retention;
    private String content;
    private String dedupeKey;
    private String subject;
    private String predicate;
    private String value;
    private String targetMemoryId;
    private Map<String, Object> structuredData;
    private double confidence;
    private Long ttlSeconds;

    public AgentMemoryCandidateResponse() {
    }

    public String getScope() { return scope; }
    public void setScope(String scope) { this.scope = scope; }
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public String getRetention() { return retention; }
    public void setRetention(String retention) { this.retention = retention; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public String getDedupeKey() { return dedupeKey; }
    public void setDedupeKey(String dedupeKey) { this.dedupeKey = dedupeKey; }
    public String getSubject() { return subject; }
    public void setSubject(String subject) { this.subject = subject; }
    public String getPredicate() { return predicate; }
    public void setPredicate(String predicate) { this.predicate = predicate; }
    public String getValue() { return value; }
    public void setValue(String value) { this.value = value; }
    public String getTargetMemoryId() { return targetMemoryId; }
    public void setTargetMemoryId(String targetMemoryId) { this.targetMemoryId = targetMemoryId; }
    public Map<String, Object> getStructuredData() { return structuredData; }
    public void setStructuredData(Map<String, Object> structuredData) { this.structuredData = structuredData; }
    public double getConfidence() { return confidence; }
    public void setConfidence(double confidence) { this.confidence = confidence; }
    public Long getTtlSeconds() { return ttlSeconds; }
    public void setTtlSeconds(Long ttlSeconds) { this.ttlSeconds = ttlSeconds; }
}
