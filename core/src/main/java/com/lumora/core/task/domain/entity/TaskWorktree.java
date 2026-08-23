package com.lumora.core.task.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.lumora.core.shared.infrastructure.persistence.SqliteInstantTypeHandler;
import com.lumora.core.task.domain.model.TaskWorkspaceMode;
import com.lumora.core.task.domain.model.WorktreeState;

import java.time.Instant;

@TableName(value = "task_worktree", autoResultMap = true)
public class TaskWorktree {

    @TableId(value = "task_id", type = IdType.INPUT)
    private String taskId;
    @TableField("workspace_mode")
    private TaskWorkspaceMode workspaceMode;
    @TableField("source_workspace_path")
    private String sourceWorkspacePath;
    @TableField("effective_workspace_path")
    private String effectiveWorkspacePath;
    @TableField("repository_root")
    private String repositoryRoot;
    @TableField("base_commit")
    private String baseCommit;
    @TableField("base_tree")
    private String baseTree;
    @TableField("result_tree")
    private String resultTree;
    @TableField("worktree_state")
    private WorktreeState worktreeState;
    @TableField("branch_name")
    private String branchName;
    @TableField("reason")
    private String reason;
    @TableField(value = "created_at", typeHandler = SqliteInstantTypeHandler.class)
    private Instant createdAt;
    @TableField(value = "updated_at", typeHandler = SqliteInstantTypeHandler.class)
    private Instant updatedAt;
    @TableField(value = "completed_at", typeHandler = SqliteInstantTypeHandler.class)
    private Instant completedAt;
    @TableField(value = "cleaned_at", typeHandler = SqliteInstantTypeHandler.class)
    private Instant cleanedAt;

    public String getTaskId() { return taskId; }
    public void setTaskId(String taskId) { this.taskId = taskId; }
    public TaskWorkspaceMode getWorkspaceMode() { return workspaceMode; }
    public void setWorkspaceMode(TaskWorkspaceMode workspaceMode) { this.workspaceMode = workspaceMode; }
    public String getSourceWorkspacePath() { return sourceWorkspacePath; }
    public void setSourceWorkspacePath(String sourceWorkspacePath) { this.sourceWorkspacePath = sourceWorkspacePath; }
    public String getEffectiveWorkspacePath() { return effectiveWorkspacePath; }
    public void setEffectiveWorkspacePath(String effectiveWorkspacePath) { this.effectiveWorkspacePath = effectiveWorkspacePath; }
    public String getRepositoryRoot() { return repositoryRoot; }
    public void setRepositoryRoot(String repositoryRoot) { this.repositoryRoot = repositoryRoot; }
    public String getBaseCommit() { return baseCommit; }
    public void setBaseCommit(String baseCommit) { this.baseCommit = baseCommit; }
    public String getBaseTree() { return baseTree; }
    public void setBaseTree(String baseTree) { this.baseTree = baseTree; }
    public String getResultTree() { return resultTree; }
    public void setResultTree(String resultTree) { this.resultTree = resultTree; }
    public WorktreeState getWorktreeState() { return worktreeState; }
    public void setWorktreeState(WorktreeState worktreeState) { this.worktreeState = worktreeState; }
    public String getBranchName() { return branchName; }
    public void setBranchName(String branchName) { this.branchName = branchName; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
    public Instant getCompletedAt() { return completedAt; }
    public void setCompletedAt(Instant completedAt) { this.completedAt = completedAt; }
    public Instant getCleanedAt() { return cleanedAt; }
    public void setCleanedAt(Instant cleanedAt) { this.cleanedAt = cleanedAt; }
}
