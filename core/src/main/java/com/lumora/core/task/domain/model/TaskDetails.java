package com.lumora.core.task.domain.model;

import com.lumora.core.task.domain.entity.AgentTask;
import com.lumora.core.task.domain.entity.TaskPlanStep;

import java.util.List;

public class TaskDetails {

    private final AgentTask task;
    private final List<TaskPlanStep> planSteps;

    public TaskDetails(AgentTask task, List<TaskPlanStep> planSteps) {
        this.task = task;
        this.planSteps = List.copyOf(planSteps);
    }

    public AgentTask getTask() {
        return task;
    }

    public List<TaskPlanStep> getPlanSteps() {
        return planSteps;
    }
}
