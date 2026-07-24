package com.lumora.core.service.impl;

import com.lumora.core.entity.AgentTask;
import com.lumora.core.entity.ApprovalDecision;
import com.lumora.core.entity.ApprovalRecord;
import com.lumora.core.entity.TaskStatus;
import com.lumora.core.exception.TaskNotFoundException;
import com.lumora.core.mapper.ApprovalMapper;
import com.lumora.core.mapper.TaskMapper;
import com.lumora.core.service.ApprovalService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.Objects;

@Service
public class ApprovalServiceImpl implements ApprovalService {

    private final TaskMapper taskMapper;
    private final ApprovalMapper approvalMapper;
    private final Clock clock;

    public ApprovalServiceImpl(
            TaskMapper taskMapper,
            ApprovalMapper approvalMapper,
            Clock clock
    ) {
        this.taskMapper = taskMapper;
        this.approvalMapper = approvalMapper;
        this.clock = clock;
    }

    @Override
    @Transactional
    public AgentTask decideApproval(
            String taskId,
            String approvalId,
            ApprovalDecision decision
    ) {
        Objects.requireNonNull(decision, "decision");
        AgentTask task = taskMapper.selectById(taskId);
        if (task == null) {
            throw new TaskNotFoundException(taskId);
        }
        if (task.getStatus() != TaskStatus.WAITING_APPROVAL) {
            throw new IllegalStateException("当前任务没有待处理的审批");
        }

        ApprovalRecord approval = approvalMapper
                .findPendingByTaskId(taskId)
                .orElseThrow(
                        () -> new IllegalStateException(
                                "当前任务没有待处理的审批"
                        )
                );
        if (!approval.getApprovalId().equals(approvalId)) {
            throw new IllegalStateException("审批请求不匹配");
        }

        approval.setDecision(decision);
        approval.setDecidedAt(clock.instant());
        int updatedRows = approvalMapper.updateDecision(approval);
        if (updatedRows != 1) {
            // 条件更新失败说明审批已被其他请求抢先处理，不能继续改任务状态。
            throw new IllegalStateException("审批已被处理，请刷新任务状态");
        }

        TaskStatus nextStatus = decision == ApprovalDecision.ALLOW_ONCE
                ? TaskStatus.COMPLETED
                : TaskStatus.REJECTED;
        task.setStatus(nextStatus);
        task.setUpdatedAt(clock.instant());
        taskMapper.updateById(task);
        return task;
    }
}
