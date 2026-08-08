package com.lumora.core.memory.domain.model;

import com.lumora.core.memory.domain.model.MemoryScopeType;
import com.lumora.core.memory.domain.model.MemoryType;

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
