package com.lumora.core.service;

import com.lumora.core.entity.Artifact;
import com.lumora.core.model.ArtifactChunk;
import com.lumora.core.model.ChatStreamEvent;

public interface ArtifactService {
    void register(String taskId, String conversationId, ChatStreamEvent event);
    ArtifactChunk read(String taskId, String artifactId, long offset, int limit);
}
