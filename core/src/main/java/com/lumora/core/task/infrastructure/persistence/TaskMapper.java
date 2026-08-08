package com.lumora.core.task.infrastructure.persistence;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.lumora.core.task.domain.entity.AgentTask;
import org.apache.ibatis.annotations.Mapper;

/**
 * 只负责 agent_task 表的读写，不包含任务状态规则。
 */
@Mapper
public interface TaskMapper extends BaseMapper<AgentTask> {
}
