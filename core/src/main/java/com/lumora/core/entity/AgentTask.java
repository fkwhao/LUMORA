package com.lumora.core.entity;

import java.time.Instant;

/**
 * 与 agent_task 表一一对应的任务实体。
 */
public class AgentTask {

    private String taskId;
    private String goal;
    private TaskStatus status;
    private long lastEventSequence;
    private String activeStep;
    private String resultSummary;
    private String failureReason;
    private Instant createdAt;
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
