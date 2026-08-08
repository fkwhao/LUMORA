package com.lumora.core.agent.dto.request;

import com.lumora.core.memory.domain.model.MemoryContextItem;

import java.time.Instant;

/** Python Memory Retrieval 所需的最小候选视图。 */
public class AgentMemoryContextRequest {
    private final String memoryId;
    private final String scope;
    private final String type;
    private final String content;
    private final double importance;
    private final double confidence;
    private final int usageCount;
    private final Instant lastUsedTime;
    private final Instant updatedTime;

    public AgentMemoryContextRequest(MemoryContextItem item) {
        this.memoryId = item.memoryId();
        this.scope = item.scopeType().name();
        this.type = item.memoryType().name();
        this.content = item.content();
        this.importance = item.importance();
        this.confidence = item.confidence();
        this.usageCount = item.usageCount();
        this.lastUsedTime = item.lastUsedAt();
        this.updatedTime = item.updatedAt();
    }

    public String getMemoryId() { return memoryId; }
    public String getScope() { return scope; }
    public String getType() { return type; }
    public String getContent() { return content; }
    public double getImportance() { return importance; }
    public double getConfidence() { return confidence; }
    public int getUsageCount() { return usageCount; }
    public Instant getLastUsedTime() { return lastUsedTime; }
    public Instant getUpdatedTime() { return updatedTime; }
}
