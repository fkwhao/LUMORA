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
@TableName(value = "agent_activation", autoResultMap = true)
public class AgentActivation {
    @TableId(value = "activation_id", type = IdType.INPUT)
    private String activationId;
    @TableField("session_id") private String sessionId;
    @TableField("run_id") private String runId;
    @TableField("status") private String status;
    @TableField("consumed_inbox_sequence") private long consumedInboxSequence;
    @TableField(value = "started_at", typeHandler = SqliteInstantTypeHandler.class)
    private Instant startedAt;
    @TableField(value = "completed_at", typeHandler = SqliteInstantTypeHandler.class)
    private Instant completedAt;
    @TableField("error_message") private String errorMessage;
}
