package com.lumora.core.conversation.domain.entity;

import com.lumora.core.conversation.domain.model.ChatMessageRole;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.lumora.core.shared.infrastructure.persistence.SqliteInstantTypeHandler;

import java.time.Instant;

@TableName(value = "conversation_message", autoResultMap = true)
public class ConversationMessage {

    @TableId(value = "message_id", type = IdType.INPUT)
    private String messageId;
    @TableField("conversation_id")
    private String conversationId;
    @TableField("sequence")
    private int sequence;
    @TableField("parent_message_id")
    private String parentMessageId;
    @TableField("message_depth")
    private int messageDepth;
    @TableField("active_path")
    private boolean activePath;
    @TableField("role")
    private ChatMessageRole role;
    @TableField("content")
    private String content;
    @TableField("model")
    private String model;
    @TableField("prompt_tokens")
    private int promptTokens;
    @TableField("completion_tokens")
    private int completionTokens;
    @TableField("total_tokens")
    private int totalTokens;
    @TableField("active_context_tokens")
    private int activeContextTokens;
    @TableField("duration_ms")
    private long durationMs;
    @TableField("work_log_json")
    private String workLogJson;
    @TableField(
            value = "created_at",
            typeHandler = SqliteInstantTypeHandler.class
    )
    private Instant createdAt;

    public ConversationMessage() {
    }

    public ConversationMessage(
            String messageId,
            String conversationId,
            int sequence,
            ChatMessageRole role,
            String content,
            String model,
            int promptTokens,
            int completionTokens,
            int totalTokens,
            Instant createdAt
    ) {
        this(
                messageId,
                conversationId,
                sequence,
                role,
                content,
                model,
                promptTokens,
                completionTokens,
                totalTokens,
                0L,
                createdAt
        );
    }

    public ConversationMessage(
            String messageId,
            String conversationId,
            int sequence,
            ChatMessageRole role,
            String content,
            String model,
            int promptTokens,
            int completionTokens,
            int totalTokens,
            long durationMs,
            Instant createdAt
    ) {
        this.messageId = messageId;
        this.conversationId = conversationId;
        this.sequence = sequence;
        this.role = role;
        this.content = content;
        this.model = model;
        this.promptTokens = promptTokens;
        this.completionTokens = completionTokens;
        this.totalTokens = totalTokens;
        this.durationMs = durationMs;
        this.workLogJson = "[]";
        this.createdAt = createdAt;
    }

    public String getMessageId() {
        return messageId;
    }

    public void setMessageId(String messageId) {
        this.messageId = messageId;
    }

    public String getConversationId() {
        return conversationId;
    }

    public void setConversationId(String conversationId) {
        this.conversationId = conversationId;
    }

    public int getSequence() {
        return sequence;
    }

    public void setSequence(int sequence) {
        this.sequence = sequence;
    }

    public String getParentMessageId() { return parentMessageId; }
    public void setParentMessageId(String parentMessageId) {
        this.parentMessageId = parentMessageId;
    }
    public int getMessageDepth() { return messageDepth; }
    public void setMessageDepth(int messageDepth) {
        this.messageDepth = messageDepth;
    }
    public boolean isActivePath() { return activePath; }
    public void setActivePath(boolean activePath) {
        this.activePath = activePath;
    }

    public ChatMessageRole getRole() {
        return role;
    }

    public void setRole(ChatMessageRole role) {
        this.role = role;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public int getPromptTokens() {
        return promptTokens;
    }

    public void setPromptTokens(int promptTokens) {
        this.promptTokens = promptTokens;
    }

    public int getCompletionTokens() {
        return completionTokens;
    }

    public void setCompletionTokens(int completionTokens) {
        this.completionTokens = completionTokens;
    }

    public int getTotalTokens() {
        return totalTokens;
    }

    public void setTotalTokens(int totalTokens) {
        this.totalTokens = totalTokens;
    }

    public int getActiveContextTokens() {
        return activeContextTokens;
    }

    public void setActiveContextTokens(int activeContextTokens) {
        this.activeContextTokens = Math.max(0, activeContextTokens);
    }

    public long getDurationMs() {
        return durationMs;
    }

    public void setDurationMs(long durationMs) {
        this.durationMs = durationMs;
    }

    public String getWorkLogJson() {
        return workLogJson;
    }

    public void setWorkLogJson(String workLogJson) {
        this.workLogJson = workLogJson;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
