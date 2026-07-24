package com.lumora.core.grpc.client;

public class AgentPlanStep {

    private final String stepId;
    private final String title;
    private final String description;
    private final boolean requiresApproval;

    public AgentPlanStep(
            String stepId,
            String title,
            String description,
            boolean requiresApproval
    ) {
        this.stepId = stepId;
        this.title = title;
        this.description = description;
        this.requiresApproval = requiresApproval;
    }

    public String getStepId() {
        return stepId;
    }

    public String getTitle() {
        return title;
    }

    public String getDescription() {
        return description;
    }

    public boolean isRequiresApproval() {
        return requiresApproval;
    }
}
