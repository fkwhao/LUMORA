package com.lumora.core.task.api.dto.response;

import com.lumora.core.conversation.api.dto.response.ConversationFileChangeResponse;

import java.time.Instant;
import java.util.List;

public record GitReviewChangesResponse(
        String scope,
        String runId,
        String commitSha,
        String baseRef,
        String headRef,
        String label,
        String repositoryRoot,
        String reason,
        int additions,
        int deletions,
        List<ConversationFileChangeResponse> files,
        Instant capturedAt
) {
    public GitReviewChangesResponse {
        files = List.copyOf(files);
    }
}
