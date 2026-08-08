package com.lumora.core.model.infrastructure.persistence;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.lumora.core.model.domain.entity.ModelConfigurationModel;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ModelConfigurationModelMapper extends BaseMapper<ModelConfigurationModel> {
}
