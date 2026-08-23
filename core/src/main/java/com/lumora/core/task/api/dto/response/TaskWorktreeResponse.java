package com.lumora.core.task.api.dto.response;

import com.lumora.core.task.domain.entity.TaskWorktree;
import com.lumora.core.task.domain.model.TaskWorkspaceMode;
import com.lumora.core.task.domain.model.WorktreeState;

import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;

public record TaskWorktreeResponse(
        String taskId,
        String workspaceMode,
        String environment,
        String worktreeState,
        String sourceWorkspacePath,
        String effectiveWorkspacePath,
        String repositoryRoot,
        String baseCommit,
        String branchName,
        String reason,
        boolean autoApplyWhenClean,
        long settingsRevision,
        boolean managedByLumora,
        boolean canAutoApply,
        List<String> conflictPaths,
        boolean canApply,
        boolean canCreateBranch,
        boolean canDiscard,
        Instant updatedAt
) {
    public static TaskWorktreeResponse from(TaskWorktree worktree) {
        boolean reviewable = switch (worktree.getWorktreeState()) {
            case WAITING_REVIEW, CONFLICTED -> true;
            default -> false;
        };
        boolean canAutoApply = worktree.isManagedByLumora()
                && worktree.getWorkspaceMode() == TaskWorkspaceMode.WORKTREE
                && switch (worktree.getWorktreeState()) {
            case BRANCHED, CLEANUP_PENDING, REMOVED, FAILED -> false;
            default -> true;
        };
        return new TaskWorktreeResponse(
                worktree.getTaskId(),
                worktree.getWorkspaceMode().name(),
                worktree.getWorkspaceMode().name(),
                worktree.getWorktreeState().name(),
                worktree.getSourceWorkspacePath(),
                worktree.getEffectiveWorkspacePath(),
                worktree.getRepositoryRoot(),
                worktree.getBaseCommit(),
                worktree.getBranchName(),
                worktree.getReason(),
                worktree.isAutoApplyWhenClean(),
                worktree.getSettingsRevision(),
                worktree.isManagedByLumora(),
                canAutoApply,
                conflictPaths(worktree.getReason()),
                reviewable && worktree.isManagedByLumora(),
                reviewable && worktree.isManagedByLumora(),
                worktree.isManagedByLumora()
                        && (reviewable || worktree.getWorktreeState()
                        == WorktreeState.CLEANUP_PENDING),
                worktree.getUpdatedAt()
        );
    }

    private static List<String> conflictPaths(String details) {
        if (details == null || details.isBlank()) return List.of();
        LinkedHashSet<String> result = new LinkedHashSet<>();
        for (String line : details.split("\\R")) {
            String[] stage = line.trim().split("\\s+", 4);
            if (stage.length == 4
                    && stage[0].matches("[0-7]{6}")
                    && stage[1].matches("[0-9a-fA-F]{40,64}")
                    && stage[2].matches("[123]")) {
                result.add(stage[3].trim());
            }
            int mergeConflict = line.indexOf("Merge conflict in ");
            if (mergeConflict >= 0) {
                String path = line.substring(
                        mergeConflict + "Merge conflict in ".length()
                ).trim();
                if (!path.isBlank()) result.add(path);
            }
        }
        return List.copyOf(result);
    }
}
