package com.lumora.core.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;

@TableName("task_plan_step")
public class TaskPlanStep {

    @TableField("task_id")
    private String taskId;
    @TableField("step_index")
    private int stepIndex;
    @TableField("step_id")
    private String stepId;
    @TableField("title")
    private String title;
    @TableField("description")
    private String description;
    @TableField("requires_approval")
    private boolean requiresApproval;

    public TaskPlanStep() {
    }

    public TaskPlanStep(
            String taskId,
            int stepIndex,
            String stepId,
            String title,
            String description,
            boolean requiresApproval
    ) {
        this.taskId = taskId;
        this.stepIndex = stepIndex;
        this.stepId = stepId;
        this.title = title;
        this.description = description;
        this.requiresApproval = requiresApproval;
    }

    public String getTaskId() {
        return taskId;
    }

    public void setTaskId(String taskId) {
        this.taskId = taskId;
    }

    public int getStepIndex() {
        return stepIndex;
    }

    public void setStepIndex(int stepIndex) {
        this.stepIndex = stepIndex;
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
