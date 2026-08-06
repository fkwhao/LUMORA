package com.lumora.core.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.lumora.core.entity.MemoryItem;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface MemoryItemMapper extends BaseMapper<MemoryItem> {

    @Delete("DELETE FROM memory_item")
    int deleteAllMemories();
}
