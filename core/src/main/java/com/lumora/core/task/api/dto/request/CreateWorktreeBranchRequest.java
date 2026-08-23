package com.lumora.core.task.api.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class CreateWorktreeBranchRequest {

    @NotBlank(message = "分支名称不能为空")
    @Size(max = 255, message = "分支名称不能超过 255 个字符")
    private String branchName;

    public String getBranchName() { return branchName; }
    public void setBranchName(String branchName) { this.branchName = branchName; }
}
