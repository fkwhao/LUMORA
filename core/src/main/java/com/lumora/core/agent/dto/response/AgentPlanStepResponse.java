package com.lumora.core.agent.dto.response;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;

public class AgentPlanStepResponse {

    private final String stepId;
    private final String title;
    private final String description;
    private final boolean requiresApproval;

    @JsonCreator
    public AgentPlanStepResponse(
            @JsonProperty("stepId") String stepId,
            @JsonProperty("title") String title,
            @JsonProperty("description") String description,
            @JsonProperty("requiresApproval") boolean requiresApproval
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
