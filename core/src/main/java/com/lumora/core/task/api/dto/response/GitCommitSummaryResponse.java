package com.lumora.core.task.api.dto.response;

import java.time.Instant;
import java.util.List;

public record GitCommitSummaryResponse(
        String sha,
        String shortSha,
        String summary,
        String authorName,
        Instant authoredAt,
        List<String> parentShas,
        List<String> decorations
) {
    public GitCommitSummaryResponse {
        parentShas = List.copyOf(parentShas);
        decorations = List.copyOf(decorations);
    }
}
