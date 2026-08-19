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
@TableName(value = "agent_inbox_message", autoResultMap = true)
public class AgentInboxMessage {
    @TableId(value = "message_id", type = IdType.INPUT)
    private String messageId;
    @TableField("session_id") private String sessionId;
    @TableField("sequence") private long sequence;
    @TableField("sender_agent_id") private String senderAgentId;
    @TableField("content") private String content;
    @TableField("status") private String status;
    @TableField(value = "created_at", typeHandler = SqliteInstantTypeHandler.class)
    private Instant createdAt;
    @TableField(value = "consumed_at", typeHandler = SqliteInstantTypeHandler.class)
    private Instant consumedAt;
}
