package com.lumora.core.approval.infrastructure.persistence;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.lumora.core.approval.domain.entity.ApprovalRecord;
import org.apache.ibatis.annotations.Mapper;

import java.util.Optional;

/**
 * 只负责 approval_request 表的读写。
 */
@Mapper
public interface ApprovalMapper extends BaseMapper<ApprovalRecord> {

    /**
     * 查询任务最近一条尚未处理的审批，避免 Service 层拼装数据库条件。
     */
    default Optional<ApprovalRecord> findPendingByTaskId(String taskId) {
        return Optional.ofNullable(selectOne(
                Wrappers.<ApprovalRecord>lambdaQuery()
                        .eq(ApprovalRecord::getTaskId, taskId)
                        .isNull(ApprovalRecord::getDecision)
                        .orderByDesc(ApprovalRecord::getCreatedAt)
                        .last("LIMIT 1")
        ));
    }

    /**
     * 仅更新尚未作出决定的记录，利用条件更新阻止重复审批覆盖原决定。
     */
    default int updateDecision(ApprovalRecord approval) {
        ApprovalRecord decisionUpdate = new ApprovalRecord();
        decisionUpdate.setDecision(approval.getDecision());
        decisionUpdate.setDecidedAt(approval.getDecidedAt());
        return update(
                decisionUpdate,
                Wrappers.<ApprovalRecord>lambdaUpdate()
                        .eq(
                                ApprovalRecord::getApprovalId,
                                approval.getApprovalId()
                        )
                        .isNull(ApprovalRecord::getDecision)
        );
    }
}
