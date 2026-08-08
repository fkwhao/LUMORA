package com.lumora.core.conversation.domain.model;

public record ArtifactChunk(
        String artifactId,
        String content,
        long offset,
        Long nextOffset,
        boolean hasMore,
        long characterCount,
        String mimeType,
        long byteSize
) {
}
