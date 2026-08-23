package com.lumora.core.task.api.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

public record GitCreateBranchRequest(
        @NotBlank(message = "分支名称不能为空")
        @Size(max = 255, message = "分支名称不能超过 255 个字符")
        String branchName,
        @Size(max = 512, message = "startPoint 不能超过 512 个字符")
        String startPoint,
        Boolean checkout,
        @PositiveOrZero(message = "expectedRevision 不能小于 0")
        Long expectedRevision
) {
}
