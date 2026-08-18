package com.lumora.core.conversation.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.lumora.core.conversation.domain.model.ConversationInputStatus;
import com.lumora.core.conversation.domain.model.ConversationInputTarget;
import com.lumora.core.shared.infrastructure.persistence.SqliteInstantTypeHandler;

import java.time.Instant;

@TableName(value = "conversation_input", autoResultMap = true)
public class ConversationInput {

    @TableId(value = "input_id", type = IdType.INPUT)
    private String inputId;
    @TableField("task_id")
    private String taskId;
    @TableField("run_id")
    private String runId;
    @TableField("target")
    private ConversationInputTarget target;
    @TableField("status")
    private ConversationInputStatus status;
    @TableField("content")
    private String content;
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
    @TableField("position")
    private long position;
    @TableField(value = "created_at", typeHandler = SqliteInstantTypeHandler.class)
    private Instant createdAt;
    @TableField(value = "updated_at", typeHandler = SqliteInstantTypeHandler.class)
    private Instant updatedAt;
    @TableField(value = "claimed_at", typeHandler = SqliteInstantTypeHandler.class)
    private Instant claimedAt;

    public String getInputId() { return inputId; }
    public void setInputId(String inputId) { this.inputId = inputId; }
    public String getTaskId() { return taskId; }
    public void setTaskId(String taskId) { this.taskId = taskId; }
    public String getRunId() { return runId; }
    public void setRunId(String runId) { this.runId = runId; }
    public ConversationInputTarget getTarget() { return target; }
    public void setTarget(ConversationInputTarget target) { this.target = target; }
    public ConversationInputStatus getStatus() { return status; }
    public void setStatus(ConversationInputStatus status) { this.status = status; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
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
    public long getPosition() { return position; }
    public void setPosition(long position) { this.position = position; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
    public Instant getClaimedAt() { return claimedAt; }
    public void setClaimedAt(Instant claimedAt) { this.claimedAt = claimedAt; }
}
