package com.lumora.core.memory.application.service;

import com.lumora.core.memory.domain.entity.MemoryItem;
import com.lumora.core.memory.domain.model.MemoryScopeType;
import com.lumora.core.memory.domain.model.MemoryContextItem;
import com.lumora.core.memory.domain.model.MemorySettings;
import com.lumora.core.memory.domain.model.MemoryWriteRequest;

import java.util.List;

public interface MemoryService {

    MemoryItem remember(MemoryWriteRequest request);

    MemorySettings getSettings();

    MemorySettings updateSettings(boolean enabled);

    boolean isEnabled();

    int reset();

    String buildPromptSummary(String conversationId);

    String buildExtractionContext(String conversationId);

    String buildExtractionContext(String conversationId, String workspacePath);

    List<MemoryContextItem> buildPromptCandidates(
            String conversationId,
            String workspacePath
    );

    String resolveProjectScopeId(String workspacePath);

    void markUsed(List<String> memoryIds);

    void archive(
            String memoryId,
            MemoryScopeType scopeType,
            String scopeId
    );
}
