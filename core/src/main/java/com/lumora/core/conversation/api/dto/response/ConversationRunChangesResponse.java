package com.lumora.core.conversation.api.dto.response;

import java.time.Instant;
import java.util.List;

public record ConversationRunChangesResponse(
        String runId,
        String status,
        String repositoryRoot,
        String reason,
        int additions,
        int deletions,
        boolean revertible,
        List<ConversationFileChangeResponse> files,
        Instant capturedAt,
        Instant revertedAt
) {
    public ConversationRunChangesResponse {
        files = List.copyOf(files);
    }
}
