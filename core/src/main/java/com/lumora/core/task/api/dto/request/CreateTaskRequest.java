package com.lumora.core.task.api.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import jakarta.validation.Valid;

public class CreateTaskRequest {

    @NotBlank(message = "任务目标不能为空")
    @Size(max = 2000, message = "任务目标不能超过 2000 个字符")
    private String goal;

    @Size(max = 4096, message = "工作区路径不能超过 4096 个字符")
    private String workspacePath;

    @Valid
    private WorkspaceHandoffRequest environmentSelection;

    public CreateTaskRequest() {
    }

    public String getGoal() {
        return goal;
    }

    public void setGoal(String goal) {
        this.goal = goal;
    }

    public String getWorkspacePath() {
        return workspacePath;
    }

    public void setWorkspacePath(String workspacePath) {
        this.workspacePath = workspacePath;
    }

    public WorkspaceHandoffRequest getEnvironmentSelection() {
        return environmentSelection;
    }

    public void setEnvironmentSelection(
            WorkspaceHandoffRequest environmentSelection
    ) {
        this.environmentSelection = environmentSelection;
    }
}
