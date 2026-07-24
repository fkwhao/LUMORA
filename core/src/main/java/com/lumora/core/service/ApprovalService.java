package com.lumora.core.service;

import com.lumora.core.entity.AgentTask;
import com.lumora.core.entity.ApprovalDecision;

/**
 * 审批业务入口，负责防止伪造、提前和重复审批。
 */
public interface ApprovalService {

    AgentTask decideApproval(
            String taskId,
            String approvalId,
            ApprovalDecision decision
    );
}
