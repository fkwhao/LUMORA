package com.lumora.core.mapper;

import com.lumora.core.entity.ApprovalRecord;
import org.apache.ibatis.annotations.Mapper;

import java.util.Optional;

/**
 * 只负责 approval_request 表的读写。
 */
@Mapper
public interface ApprovalMapper {

    Optional<ApprovalRecord> findPendingByTaskId(String taskId);

    int updateDecision(ApprovalRecord approval);
}
