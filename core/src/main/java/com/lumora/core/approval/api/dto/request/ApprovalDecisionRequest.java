package com.lumora.core.approval.api.dto.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

public class ApprovalDecisionRequest {

    @NotNull(message = "审批决定不能为空")
    @Pattern(
            regexp = "ALLOW_ONCE|REJECT",
            message = "审批决定无效"
    )
    private String decision;

    public ApprovalDecisionRequest() {
    }

    public String getDecision() {
        return decision;
    }

    public void setDecision(String decision) {
        this.decision = decision;
    }
}
