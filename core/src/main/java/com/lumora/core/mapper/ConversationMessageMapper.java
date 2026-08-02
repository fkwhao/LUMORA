package com.lumora.core.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.lumora.core.entity.ConversationMessage;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ConversationMessageMapper
        extends BaseMapper<ConversationMessage> {
}
