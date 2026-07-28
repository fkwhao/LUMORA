package com.lumora.core.dto.response;

import com.lumora.core.entity.AgentTask;
import com.lumora.core.entity.TaskStatus;
import com.lumora.core.task.model.TaskDetails;

import java.time.Instant;
import java.util.List;

public class TaskResponse {

    private String taskId;
    private String goal;
    private TaskStatus status;
    private long lastEventSequence;
    private String activeStep;
    private String resultSummary;
    private String failureReason;
    private List<TaskPlanStepResponse> planSteps = List.of();
    private Instant createdAt;
    private Instant updatedAt;

    public TaskResponse() {
    }

    public static TaskResponse fromEntity(AgentTask task) {
        TaskResponse response = new TaskResponse();
        response.setTaskId(task.getTaskId());
        response.setGoal(task.getGoal());
        response.setStatus(task.getStatus());
        response.setLastEventSequence(task.getLastEventSequence());
        response.setActiveStep(task.getActiveStep());
        response.setResultSummary(task.getResultSummary());
        response.setFailureReason(task.getFailureReason());
        response.setCreatedAt(task.getCreatedAt());
        response.setUpdatedAt(task.getUpdatedAt());
        return response;
    }

    public static TaskResponse fromDetails(TaskDetails details) {
        TaskResponse response = fromEntity(details.getTask());
        response.setPlanSteps(
                details.getPlanSteps().stream()
                        .map(TaskPlanStepResponse::fromEntity)
                        .toList()
        );
        return response;
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
