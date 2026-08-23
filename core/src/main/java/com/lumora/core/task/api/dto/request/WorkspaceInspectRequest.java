package com.lumora.core.task.api.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record WorkspaceInspectRequest(
        @NotBlank(message = "工作区路径不能为空")
        @Size(max = 4096, message = "工作区路径不能超过 4096 个字符")
        String workspacePath,
        @Size(max = 128, message = "任务 ID 不能超过 128 个字符")
        String taskId
) {
}
