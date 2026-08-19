package com.lumora.core.task.api.dto.response;

import java.time.Instant;
import java.util.List;

public class TaskResponse {

    private String taskId;
    private String goal;
    private String status;
    private long lastEventSequence;
    private String activeStep;
    private String resultSummary;
    private String failureReason;
    private String selectedModel;
    private String selectedReasoningEffort;
    private String workspacePath;
    private List<TaskPlanStepResponse> planSteps = List.of();
    private Instant createdAt;
    private Instant updatedAt;

    public TaskResponse() {
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

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
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

    public List<TaskPlanStepResponse> getPlanSteps() {
        return planSteps;
    }

    public void setPlanSteps(List<TaskPlanStepResponse> planSteps) {
        this.planSteps = List.copyOf(planSteps);
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
