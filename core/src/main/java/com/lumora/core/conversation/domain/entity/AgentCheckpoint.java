package com.lumora.core.conversation.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.lumora.core.shared.infrastructure.persistence.SqliteInstantTypeHandler;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Getter
@Setter
@TableName(value = "agent_checkpoint", autoResultMap = true)
public class AgentCheckpoint {
    @TableId(value = "checkpoint_id", type = IdType.INPUT)
    private String checkpointId;
    @TableField("session_id") private String sessionId;
    @TableField("sequence") private long sequence;
    @TableField("consumed_inbox_sequence") private long consumedInboxSequence;
    @TableField("transcript_json") private String transcriptJson;
    @TableField("summary") private String summary;
    @TableField("status") private String status;
    @TableField(value = "created_at", typeHandler = SqliteInstantTypeHandler.class)
    private Instant createdAt;
}
