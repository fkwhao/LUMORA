package com.lumora.core.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.lumora.core.entity.ApplicationSetting;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ApplicationSettingMapper
        extends BaseMapper<ApplicationSetting> {
}
