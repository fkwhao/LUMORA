package com.lumora.core.service;

import com.lumora.core.entity.MemoryItem;
import com.lumora.core.model.MemoryWriteRequest;

public interface MemoryService {

    MemoryItem remember(MemoryWriteRequest request);

    String buildPromptSummary(String conversationId);

    String buildExtractionContext(String conversationId);

    void archive(String memoryId);
}
