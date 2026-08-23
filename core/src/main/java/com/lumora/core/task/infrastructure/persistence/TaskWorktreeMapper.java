package com.lumora.core.task.infrastructure.persistence;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.lumora.core.task.domain.entity.TaskWorktree;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface TaskWorktreeMapper extends BaseMapper<TaskWorktree> {
}
