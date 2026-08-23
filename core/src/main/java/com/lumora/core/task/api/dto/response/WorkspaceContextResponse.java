package com.lumora.core.task.api.dto.response;

import java.util.List;

public record WorkspaceContextResponse(
        long workspaceRevision,
        String repositoryRoot,
        String sourceWorkspacePath,
        String effectiveWorkspacePath,
        WorkspaceEnvironmentSummaryResponse environment,
        GitBranchSummaryResponse branch,
        String headSha,
        boolean detached,
        WorkspaceGitStatusResponse status,
        List<WorkspaceEnvironmentSummaryResponse> worktrees,
        List<GitBranchSummaryResponse> branches
) {
    public WorkspaceContextResponse {
        worktrees = List.copyOf(worktrees);
        branches = List.copyOf(branches);
    }
}
