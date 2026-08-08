package com.lumora.core.conversation.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.lumora.core.shared.infrastructure.persistence.SqliteInstantTypeHandler;

import java.time.Instant;

@TableName(value = "conversation_context_summary", autoResultMap = true)
public class ConversationContextSummary {
    @TableId(value = "summary_id", type = IdType.INPUT)
    private String summaryId;
    @TableField("conversation_id") private String conversationId;
    @TableField("version") private int version;
    @TableField("from_sequence") private int fromSequence;
    @TableField("through_sequence") private int throughSequence;
    @TableField("summary_text") private String summaryText;
    @TableField("before_tokens") private int beforeTokens;
    @TableField("after_tokens") private int afterTokens;
    @TableField("status") private String status;
    @TableField(value = "created_at", typeHandler = SqliteInstantTypeHandler.class)
    private Instant createdAt;

    public ConversationContextSummary() {}

    public ConversationContextSummary(String summaryId, String conversationId,
            int version, int fromSequence, int throughSequence,
            String summaryText, int beforeTokens, int afterTokens,
            String status, Instant createdAt) {
        this.summaryId = summaryId;
        this.conversationId = conversationId;
        this.version = version;
        this.fromSequence = fromSequence;
        this.throughSequence = throughSequence;
        this.summaryText = summaryText;
        this.beforeTokens = beforeTokens;
        this.afterTokens = afterTokens;
        this.status = status;
        this.createdAt = createdAt;
    }

    public String getSummaryId() { return summaryId; }
    public String getConversationId() { return conversationId; }
    public int getVersion() { return version; }
    public int getFromSequence() { return fromSequence; }
    public int getThroughSequence() { return throughSequence; }
    public String getSummaryText() { return summaryText; }
    public int getBeforeTokens() { return beforeTokens; }
    public int getAfterTokens() { return afterTokens; }
    public String getStatus() { return status; }
    public Instant getCreatedAt() { return createdAt; }
}
