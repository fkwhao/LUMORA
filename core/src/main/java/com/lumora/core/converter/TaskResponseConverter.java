package com.lumora.core.converter;

import com.lumora.core.dto.response.TaskPlanStepResponse;
import com.lumora.core.dto.response.TaskResponse;
import com.lumora.core.entity.AgentTask;
import com.lumora.core.entity.TaskPlanStep;
import com.lumora.core.task.model.TaskDetails;
import org.springframework.stereotype.Component;

/** 隔离任务领域对象与桌面端 REST DTO。 */
@Component
public class TaskResponseConverter {

    public TaskResponse fromTask(AgentTask task) {
        TaskResponse response = new TaskResponse();
        response.setTaskId(task.getTaskId());
        response.setGoal(task.getGoal());
        response.setStatus(task.getStatus().name());
        response.setLastEventSequence(task.getLastEventSequence());
        response.setActiveStep(task.getActiveStep());
        response.setResultSummary(task.getResultSummary());
        response.setFailureReason(task.getFailureReason());
        response.setCreatedAt(task.getCreatedAt());
        response.setUpdatedAt(task.getUpdatedAt());
        return response;
    }

    public TaskResponse fromDetails(TaskDetails details) {
        TaskResponse response = fromTask(details.getTask());
        response.setPlanSteps(
                details.getPlanSteps().stream().map(this::fromStep).toList()
        );
        return response;
    }

    private TaskPlanStepResponse fromStep(TaskPlanStep step) {
        TaskPlanStepResponse response = new TaskPlanStepResponse();
        response.setStepId(step.getStepId());
        response.setTitle(step.getTitle());
        response.setDescription(step.getDescription());
        response.setRequiresApproval(step.isRequiresApproval());
        return response;
    }
}
