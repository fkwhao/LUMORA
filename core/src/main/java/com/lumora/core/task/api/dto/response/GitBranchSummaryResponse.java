package com.lumora.core.task.api.dto.response;

public record GitBranchSummaryResponse(
        String name,
        boolean current,
        boolean remote,
        String headSha,
        String upstream,
        int ahead,
        int behind,
        String worktreePath
) {
}
