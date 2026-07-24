package com.lumora.core.dto.request;

import com.lumora.core.entity.ApprovalDecision;
import jakarta.validation.constraints.NotNull;

public class ApprovalDecisionRequest {

    @NotNull(message = "审批决定不能为空")
    private ApprovalDecision decision;

    public ApprovalDecisionRequest() {
    }

    public ApprovalDecision getDecision() {
        return decision;
    }

    public void setDecision(ApprovalDecision decision) {
        this.decision = decision;
    }
}
