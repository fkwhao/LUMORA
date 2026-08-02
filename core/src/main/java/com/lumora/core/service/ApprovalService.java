package com.lumora.core.service;

import com.lumora.core.entity.AgentTask;
import com.lumora.core.entity.ApprovalDecision;

/**
 * 审批业务入口，负责防止伪造、提前和重复审批。
 */
public interface ApprovalService {

    /**
     * 对等待中的审批请求作出一次不可重复的决定。
     *
     * @param taskId 任务 ID
     * @param approvalId 审批请求 ID
     * @param decision 用户审批决定
     * @return 审批后的最新任务状态
     * @throws IllegalArgumentException 参数无效、审批不存在或已处理
     */
    AgentTask decideApproval(
            String taskId,
            String approvalId,
            ApprovalDecision decision
    );
}
