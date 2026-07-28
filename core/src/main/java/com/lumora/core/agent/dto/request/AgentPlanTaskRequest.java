package com.lumora.core.agent.dto.request;

public class AgentPlanTaskRequest {

    private final String taskId;
    private final String goal;

    public AgentPlanTaskRequest(String taskId, String goal) {
        this.taskId = taskId;
        this.goal = goal;
    }

    public String getTaskId() {
        return taskId;
    }

    public String getGoal() {
        return goal;
    }
}
