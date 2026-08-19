package com.lumora.core.task.api.dto.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public class UpdateTaskWorkspaceRequest {

    @NotNull(message = "工作区路径不能为空")
    @Size(max = 4096, message = "工作区路径不能超过 4096 个字符")
    private String workspacePath;

    public UpdateTaskWorkspaceRequest() {
    }

    public String getWorkspacePath() {
        return workspacePath;
    }

    public void setWorkspacePath(String workspacePath) {
        this.workspacePath = workspacePath;
    }
}
