package com.lumora.core.conversation.infrastructure.persistence;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.lumora.core.conversation.domain.entity.Artifact;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ArtifactMapper extends BaseMapper<Artifact> {
}
