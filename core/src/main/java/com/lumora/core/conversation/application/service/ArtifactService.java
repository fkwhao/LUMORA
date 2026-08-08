package com.lumora.core.conversation.application.service;

import com.lumora.core.conversation.domain.model.ArtifactChunk;

import com.lumora.core.conversation.domain.entity.Artifact;
import com.lumora.core.conversation.domain.model.ArtifactChunk;
import com.lumora.core.conversation.domain.model.ChatStreamEvent;

public interface ArtifactService {
    void register(String taskId, String conversationId, ChatStreamEvent event);
    ArtifactChunk read(String taskId, String artifactId, long offset, int limit);
}
