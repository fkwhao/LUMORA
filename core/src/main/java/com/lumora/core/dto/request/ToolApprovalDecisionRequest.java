package com.lumora.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public class ToolApprovalDecisionRequest {

    @NotBlank(message = "审批决定不能为空")
    @Pattern(
            regexp = "allow_once|allow_always|deny",
            message = "审批决定无效"
    )
    private String decision;

    public String getDecision() {
        return decision;
    }

    public void setDecision(String decision) {
        this.decision = decision;
    }
}
