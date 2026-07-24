package com.lumora.core.entity;

import java.time.Instant;

/**
 * 与 approval_request 表对应的审批记录。
 */
public class ApprovalRecord {

    private String approvalId;
    private String taskId;
    private String action;
    private String impactSummary;
    private String riskLevel;
    private boolean reversible;
    private ApprovalDecision decision;
    private Instant createdAt;
    private Instant decidedAt;

    public ApprovalRecord() {
    }

    public ApprovalRecord(
            String approvalId,
            String taskId,
            String action,
            String impactSummary,
            String riskLevel,
            boolean reversible,
            ApprovalDecision decision,
            Instant createdAt,
            Instant decidedAt
    ) {
        this.approvalId = approvalId;
        this.taskId = taskId;
        this.action = action;
        this.impactSummary = impactSummary;
        this.riskLevel = riskLevel;
        this.reversible = reversible;
        this.decision = decision;
        this.createdAt = createdAt;
        this.decidedAt = decidedAt;
    }

    public String getApprovalId() {
        return approvalId;
    }

    public void setApprovalId(String approvalId) {
        this.approvalId = approvalId;
    }

    public String getTaskId() {
        return taskId;
    }

    public void setTaskId(String taskId) {
        this.taskId = taskId;
    }

    public String getAction() {
        return action;
    }

    public void setAction(String action) {
        this.action = action;
    }

    public String getImpactSummary() {
        return impactSummary;
    }

    public void setImpactSummary(String impactSummary) {
        this.impactSummary = impactSummary;
    }

    public String getRiskLevel() {
        return riskLevel;
    }

    public void setRiskLevel(String riskLevel) {
        this.riskLevel = riskLevel;
    }

    public boolean isReversible() {
        return reversible;
    }

    public void setReversible(boolean reversible) {
        this.reversible = reversible;
    }

    public ApprovalDecision getDecision() {
        return decision;
    }

    public void setDecision(ApprovalDecision decision) {
        this.decision = decision;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getDecidedAt() {
        return decidedAt;
    }

    public void setDecidedAt(Instant decidedAt) {
        this.decidedAt = decidedAt;
    }
}
