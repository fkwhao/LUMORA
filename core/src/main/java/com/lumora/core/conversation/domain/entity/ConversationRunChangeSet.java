package com.lumora.core.conversation.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.lumora.core.conversation.domain.model.RunChangeSetStatus;
import com.lumora.core.shared.infrastructure.persistence.SqliteInstantTypeHandler;

import java.time.Instant;

@TableName(value = "conversation_run_change_set", autoResultMap = true)
public class ConversationRunChangeSet {

    @TableId(value = "run_id", type = IdType.INPUT)
    private String runId;
    @TableField("task_id")
    private String taskId;
    @TableField("repository_root")
    private String repositoryRoot;
    @TableField("before_tree")
    private String beforeTree;
    @TableField("after_tree")
    private String afterTree;
    @TableField("before_head")
    private String beforeHead;
    @TableField("after_head")
    private String afterHead;
    @TableField("before_index_tree")
    private String beforeIndexTree;
    @TableField("after_index_tree")
    private String afterIndexTree;
    @TableField("status")
    private RunChangeSetStatus status;
    @TableField("reason")
    private String reason;
    @TableField(value = "created_at", typeHandler = SqliteInstantTypeHandler.class)
    private Instant createdAt;
    @TableField(value = "updated_at", typeHandler = SqliteInstantTypeHandler.class)
    private Instant updatedAt;
    @TableField(value = "captured_at", typeHandler = SqliteInstantTypeHandler.class)
    private Instant capturedAt;
    @TableField(value = "reverted_at", typeHandler = SqliteInstantTypeHandler.class)
    private Instant revertedAt;

    public String getRunId() { return runId; }
    public void setRunId(String runId) { this.runId = runId; }
    public String getTaskId() { return taskId; }
    public void setTaskId(String taskId) { this.taskId = taskId; }
    public String getRepositoryRoot() { return repositoryRoot; }
    public void setRepositoryRoot(String repositoryRoot) { this.repositoryRoot = repositoryRoot; }
    public String getBeforeTree() { return beforeTree; }
    public void setBeforeTree(String beforeTree) { this.beforeTree = beforeTree; }
    public String getAfterTree() { return afterTree; }
    public void setAfterTree(String afterTree) { this.afterTree = afterTree; }
    public String getBeforeHead() { return beforeHead; }
    public void setBeforeHead(String beforeHead) { this.beforeHead = beforeHead; }
    public String getAfterHead() { return afterHead; }
    public void setAfterHead(String afterHead) { this.afterHead = afterHead; }
    public String getBeforeIndexTree() { return beforeIndexTree; }
    public void setBeforeIndexTree(String beforeIndexTree) { this.beforeIndexTree = beforeIndexTree; }
    public String getAfterIndexTree() { return afterIndexTree; }
    public void setAfterIndexTree(String afterIndexTree) { this.afterIndexTree = afterIndexTree; }
    public RunChangeSetStatus getStatus() { return status; }
    public void setStatus(RunChangeSetStatus status) { this.status = status; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
    public Instant getCapturedAt() { return capturedAt; }
    public void setCapturedAt(Instant capturedAt) { this.capturedAt = capturedAt; }
    public Instant getRevertedAt() { return revertedAt; }
    public void setRevertedAt(Instant revertedAt) { this.revertedAt = revertedAt; }
}
