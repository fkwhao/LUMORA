package com.lumora.core.task.api.dto.response;

import java.util.List;

public record GitHistoryResponse(
        List<GitCommitSummaryResponse> commits,
        String nextCursor
) {
    public GitHistoryResponse {
        commits = List.copyOf(commits);
    }
}
