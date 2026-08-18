package com.lumora.core.conversation.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.lumora.core.conversation.domain.model.ConversationRunStatus;
import com.lumora.core.conversation.domain.model.ConversationRunTrigger;
import com.lumora.core.shared.infrastructure.persistence.SqliteInstantTypeHandler;

import java.time.Instant;

@TableName(value = "conversation_run", autoResultMap = true)
public class ConversationRun {

    @TableId(value = "run_id", type = IdType.INPUT)
    private String runId;
    @TableField("task_id")
    private String taskId;
    @TableField("status")
    private ConversationRunStatus status;
    @TableField("trigger_type")
    private ConversationRunTrigger triggerType;
    @TableField("source_message_id")
    private String sourceMessageId;
    @TableField("input_content")
    private String inputContent;
    @TableField("attachments_json")
    private String attachmentsJson;
    @TableField("model")
    private String model;
    @TableField("reasoning_effort")
    private String reasoningEffort;
    @TableField("workspace_path")
    private String workspacePath;
    @TableField("permission_mode")
    private String permissionMode;
    @TableField("last_event_sequence")
    private long lastEventSequence;
    @TableField("replay_from_sequence")
    private long replayFromSequence;
    @TableField("error_message")
    private String errorMessage;
    @TableField(value = "created_at", typeHandler = SqliteInstantTypeHandler.class)
    private Instant createdAt;
    @TableField(value = "started_at", typeHandler = SqliteInstantTypeHandler.class)
    private Instant startedAt;
    @TableField(value = "updated_at", typeHandler = SqliteInstantTypeHandler.class)
    private Instant updatedAt;
    @TableField(value = "completed_at", typeHandler = SqliteInstantTypeHandler.class)
    private Instant completedAt;

    public ConversationRun() {
    }

    public String getRunId() { return runId; }
    public void setRunId(String runId) { this.runId = runId; }
    public String getTaskId() { return taskId; }
    public void setTaskId(String taskId) { this.taskId = taskId; }
    public ConversationRunStatus getStatus() { return status; }
    public void setStatus(ConversationRunStatus status) { this.status = status; }
    public ConversationRunTrigger getTriggerType() { return triggerType; }
    public void setTriggerType(ConversationRunTrigger triggerType) { this.triggerType = triggerType; }
    public String getSourceMessageId() { return sourceMessageId; }
    public void setSourceMessageId(String sourceMessageId) { this.sourceMessageId = sourceMessageId; }
    public String getInputContent() { return inputContent; }
    public void setInputContent(String inputContent) { this.inputContent = inputContent; }
    public String getAttachmentsJson() { return attachmentsJson; }
    public void setAttachmentsJson(String attachmentsJson) {
        this.attachmentsJson = attachmentsJson == null ? "[]" : attachmentsJson;
    }
    public String getModel() { return model; }
    public void setModel(String model) { this.model = model; }
    public String getReasoningEffort() { return reasoningEffort; }
    public void setReasoningEffort(String reasoningEffort) { this.reasoningEffort = reasoningEffort; }
    public String getWorkspacePath() { return workspacePath; }
    public void setWorkspacePath(String workspacePath) { this.workspacePath = workspacePath; }
    public String getPermissionMode() { return permissionMode; }
    public void setPermissionMode(String permissionMode) { this.permissionMode = permissionMode; }
    public long getLastEventSequence() { return lastEventSequence; }
    public void setLastEventSequence(long lastEventSequence) { this.lastEventSequence = lastEventSequence; }
    public long getReplayFromSequence() { return replayFromSequence; }
    public void setReplayFromSequence(long replayFromSequence) { this.replayFromSequence = replayFromSequence; }
    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getStartedAt() { return startedAt; }
    public void setStartedAt(Instant startedAt) { this.startedAt = startedAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
    public Instant getCompletedAt() { return completedAt; }
    public void setCompletedAt(Instant completedAt) { this.completedAt = completedAt; }
}
