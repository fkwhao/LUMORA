package com.lumora.core.agent.dto.response;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

public class AgentPlanTaskResponse {

    private final String taskId;
    private final List<AgentPlanStepResponse> steps;

    @JsonCreator
    public AgentPlanTaskResponse(
            @JsonProperty("taskId") String taskId,
            @JsonProperty("steps") List<AgentPlanStepResponse> steps
    ) {
        this.taskId = taskId;
        this.steps = steps == null ? List.of() : List.copyOf(steps);
    }

    public String getTaskId() {
        return taskId;
    }

    public List<AgentPlanStepResponse> getSteps() {
        return steps;
    }
}
