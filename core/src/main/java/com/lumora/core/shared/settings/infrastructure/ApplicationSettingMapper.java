package com.lumora.core.shared.settings.infrastructure;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.lumora.core.shared.settings.domain.ApplicationSetting;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ApplicationSettingMapper
        extends BaseMapper<ApplicationSetting> {
}
