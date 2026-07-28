package com.lumora.core.dto.response;

import com.lumora.core.entity.TaskPlanStep;

public class TaskPlanStepResponse {

    private String stepId;
    private String title;
    private String description;
    private boolean requiresApproval;

    public TaskPlanStepResponse() {
    }

    public static TaskPlanStepResponse fromEntity(TaskPlanStep step) {
        TaskPlanStepResponse response = new TaskPlanStepResponse();
        response.setStepId(step.getStepId());
        response.setTitle(step.getTitle());
        response.setDescription(step.getDescription());
        response.setRequiresApproval(step.isRequiresApproval());
        return response;
    }

    public String getStepId() {
        return stepId;
    }

    public void setStepId(String stepId) {
        this.stepId = stepId;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public boolean isRequiresApproval() {
        return requiresApproval;
    }

    public void setRequiresApproval(boolean requiresApproval) {
        this.requiresApproval = requiresApproval;
    }
}
