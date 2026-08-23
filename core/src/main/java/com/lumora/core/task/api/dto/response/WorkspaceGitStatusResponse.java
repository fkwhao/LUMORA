package com.lumora.core.task.api.dto.response;

public record WorkspaceGitStatusResponse(
        boolean clean,
        int staged,
        int unstaged,
        int untracked,
        int conflicted,
        int ahead,
        int behind
) {
}
