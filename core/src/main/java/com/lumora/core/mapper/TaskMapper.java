package com.lumora.core.mapper;

import com.lumora.core.entity.AgentTask;
import org.apache.ibatis.annotations.Mapper;

import java.util.Optional;

/**
 * 只负责 agent_task 表的读写，不包含任务状态规则。
 */
@Mapper
public interface TaskMapper {

    int insert(AgentTask task);

    Optional<AgentTask> findById(String taskId);

    int update(AgentTask task);
}
