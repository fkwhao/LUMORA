package com.lumora.core.task.domain.entity;

import com.lumora.core.task.domain.model.TaskStatus;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.lumora.core.shared.infrastructure.persistence.SqliteInstantTypeHandler;

import java.time.Instant;

/**
 * 与 agent_task 表一一对应的任务实体。
 */
@TableName(value = "agent_task", autoResultMap = true)
public class AgentTask {

    @TableId(value = "task_id", type = IdType.INPUT)
    private String taskId;
    @TableField("goal")
    private String goal;
    @TableField("status")
    private TaskStatus status;
    @TableField("last_event_sequence")
    private long lastEventSequence;
    @TableField("active_step")
    private String activeStep;
    @TableField("result_summary")
    private String resultSummary;
    @TableField("failure_reason")
    private String failureReason;
    @TableField("selected_model")
    private String selectedModel;
    @TableField("selected_reasoning_effort")
    private String selectedReasoningEffort;
    @TableField("workspace_path")
    private String workspacePath;
    @TableField(
            value = "created_at",
            typeHandler = SqliteInstantTypeHandler.class
    )
    private Instant createdAt;
    @TableField(
            value = "updated_at",
            typeHandler = SqliteInstantTypeHandler.class
    )
    private Instant updatedAt;

    public AgentTask() {
    }

    public AgentTask(
            String taskId,
            String goal,
            TaskStatus status,
            long lastEventSequence,
            String activeStep,
            String resultSummary,
            String failureReason,
            Instant createdAt,
            Instant updatedAt
    ) {
        this.taskId = taskId;
        this.goal = goal;
        this.status = status;
        this.lastEventSequence = lastEventSequence;
        this.activeStep = activeStep;
        this.resultSummary = resultSummary;
        this.failureReason = failureReason;
        this.selectedModel = "";
        this.selectedReasoningEffort = "";
        this.workspacePath = "";
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public String getTaskId() {
        return taskId;
    }

    public void setTaskId(String taskId) {
        this.taskId = taskId;
    }

    public String getGoal() {
        return goal;
    }

    public void setGoal(String goal) {
        this.goal = goal;
    }

    public TaskStatus getStatus() {
        return status;
    }

    public void setStatus(TaskStatus status) {
        this.status = status;
    }

    public long getLastEventSequence() {
        return lastEventSequence;
    }

    public void setLastEventSequence(long lastEventSequence) {
        this.lastEventSequence = lastEventSequence;
    }

    public String getActiveStep() {
        return activeStep;
    }

    public void setActiveStep(String activeStep) {
        this.activeStep = activeStep;
    }

    public String getResultSummary() {
        return resultSummary;
    }

    public void setResultSummary(String resultSummary) {
        this.resultSummary = resultSummary;
    }

    public String getFailureReason() {
        return failureReason;
    }

    public void setFailureReason(String failureReason) {
        this.failureReason = failureReason;
    }

    public String getSelectedModel() {
        return selectedModel;
    }

    public void setSelectedModel(String selectedModel) {
        this.selectedModel = selectedModel;
    }

    public String getSelectedReasoningEffort() {
        return selectedReasoningEffort;
    }

    public void setSelectedReasoningEffort(String selectedReasoningEffort) {
        this.selectedReasoningEffort = selectedReasoningEffort;
    }

    public String getWorkspacePath() {
        return workspacePath;
    }

    public void setWorkspacePath(String workspacePath) {
        this.workspacePath = workspacePath;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
