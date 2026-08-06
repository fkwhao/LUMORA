package com.lumora.core.model;

import com.lumora.core.entity.MemoryScopeType;
import com.lumora.core.entity.MemoryType;

import java.time.Instant;

/** 发送给 Python Retrieval 层的有界记忆候选，不暴露持久化实体。 */
public record MemoryContextItem(
        String memoryId,
        MemoryScopeType scopeType,
        MemoryType memoryType,
        String content,
        double importance,
        double confidence,
        int usageCount,
        Instant lastUsedAt,
        Instant updatedAt
) {
}
