package com.lumora.core.task.api.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

public class WorkspaceHandoffRequest {

    @NotBlank(message = "目标执行环境不能为空")
    @Size(max = 32, message = "目标执行环境不能超过 32 个字符")
    private String target;

    @Size(max = 4096, message = "Worktree 路径不能超过 4096 个字符")
    private String worktreePath;

    private Boolean autoApplyWhenClean;

    @PositiveOrZero(message = "expectedRevision 不能小于 0")
    private Long expectedRevision;

    public String getTarget() {
        return target;
    }

    public void setTarget(String target) {
        this.target = target;
    }

    public String getWorktreePath() {
        return worktreePath;
    }

    public void setWorktreePath(String worktreePath) {
        this.worktreePath = worktreePath;
    }

    public Boolean getAutoApplyWhenClean() {
        return autoApplyWhenClean;
    }

    public void setAutoApplyWhenClean(Boolean autoApplyWhenClean) {
        this.autoApplyWhenClean = autoApplyWhenClean;
    }

    public Long getExpectedRevision() {
        return expectedRevision;
    }

    public void setExpectedRevision(Long expectedRevision) {
        this.expectedRevision = expectedRevision;
    }
}
