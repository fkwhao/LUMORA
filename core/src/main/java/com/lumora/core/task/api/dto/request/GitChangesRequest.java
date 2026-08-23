package com.lumora.core.task.api.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record GitChangesRequest(
        @NotBlank(message = "scope 不能为空")
        @Size(max = 32, message = "scope 不能超过 32 个字符")
        String scope,
        @Size(max = 128) String runId,
        @Size(max = 512) String commitSha,
        @Size(max = 512) String baseCommit,
        @Size(max = 512) String baseRef,
        @Size(max = 512) String headRef
) {
}
