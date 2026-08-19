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
@TableName(value = "agent_session", autoResultMap = true)
public class AgentSession {
    @TableId(value = "session_id", type = IdType.INPUT)
    private String sessionId;
    @TableField("agent_id") private String agentId;
    @TableField("task_id") private String taskId;
    @TableField("parent_session_id") private String parentSessionId;
    @TableField("parent_agent_id") private String parentAgentId;
    @TableField("label") private String label;
    @TableField("mode") private String mode;
    @TableField("status") private String status;
    @TableField("delegation_depth") private int delegationDepth;
    @TableField("model") private String model;
    @TableField("latest_report") private String latestReport;
    @TableField("unread_report_count") private int unreadReportCount;
    @TableField("last_inbox_sequence") private long lastInboxSequence;
    @TableField("consumed_inbox_sequence") private long consumedInboxSequence;
    @TableField("checkpoint_sequence") private long checkpointSequence;
    @TableField("active_activation_id") private String activeActivationId;
    @TableField(value = "created_at", typeHandler = SqliteInstantTypeHandler.class)
    private Instant createdAt;
    @TableField(value = "updated_at", typeHandler = SqliteInstantTypeHandler.class)
    private Instant updatedAt;
    @TableField(value = "closed_at", typeHandler = SqliteInstantTypeHandler.class)
    private Instant closedAt;
}
