package com.lumora.core.task.api.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RemoveGitWorktreeRequest(
        @NotBlank(message = "Worktree 路径不能为空")
        @Size(max = 4096, message = "Worktree 路径不能超过 4096 个字符")
        String worktreePath
) {
}
