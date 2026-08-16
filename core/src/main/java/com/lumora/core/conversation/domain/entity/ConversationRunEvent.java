package com.lumora.core.conversation.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.lumora.core.shared.infrastructure.persistence.SqliteInstantTypeHandler;

import java.time.Instant;

@TableName(value = "conversation_run_event", autoResultMap = true)
public class ConversationRunEvent {

    @TableId(value = "event_id", type = IdType.INPUT)
    private String eventId;
    @TableField("run_id")
    private String runId;
    @TableField("sequence")
    private long sequence;
    @TableField("event_json")
    private String eventJson;
    @TableField(value = "occurred_at", typeHandler = SqliteInstantTypeHandler.class)
    private Instant occurredAt;

    public ConversationRunEvent() {
    }

    public String getEventId() { return eventId; }
    public void setEventId(String eventId) { this.eventId = eventId; }
    public String getRunId() { return runId; }
    public void setRunId(String runId) { this.runId = runId; }
    public long getSequence() { return sequence; }
    public void setSequence(long sequence) { this.sequence = sequence; }
    public String getEventJson() { return eventJson; }
    public void setEventJson(String eventJson) { this.eventJson = eventJson; }
    public Instant getOccurredAt() { return occurredAt; }
    public void setOccurredAt(Instant occurredAt) { this.occurredAt = occurredAt; }
}
