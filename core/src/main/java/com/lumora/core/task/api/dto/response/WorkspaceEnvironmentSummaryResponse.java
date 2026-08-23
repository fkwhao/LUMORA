package com.lumora.core.task.api.dto.response;

public record WorkspaceEnvironmentSummaryResponse(
        String mode,
        String label,
        String path,
        String worktreePath,
        String branchName,
        String headSha,
        String state,
        boolean current,
        boolean removable,
        String taskId,
        boolean autoApplyWhenClean,
        long settingsRevision,
        boolean managedByLumora,
        boolean canAutoApply
) {
}
