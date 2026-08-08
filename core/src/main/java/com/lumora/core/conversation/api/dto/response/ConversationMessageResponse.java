package com.lumora.core.conversation.api.dto.response;

import java.time.Instant;

public class ConversationMessageResponse {

    private final String messageId;
    private final int sequence;
    private final String parentMessageId;
    private final int messageDepth;
    private final boolean activePath;
    private final String role;
    private final String content;
    private final String model;
    private final TokenUsageResponse usage;
    private final int activeContextTokens;
    private final long durationMs;
    private final String workLogJson;
    private final Instant createdAt;

    public ConversationMessageResponse(
            String messageId,
            int sequence,
            String parentMessageId,
            int messageDepth,
            boolean activePath,
            String role,
            String content,
            String model,
            TokenUsageResponse usage,
            int activeContextTokens,
            long durationMs,
            String workLogJson,
            Instant createdAt
    ) {
        this.messageId = messageId;
        this.sequence = sequence;
        this.parentMessageId = parentMessageId;
        this.messageDepth = messageDepth;
        this.activePath = activePath;
        this.role = role;
        this.content = content;
        this.model = model;
        this.usage = usage;
        this.activeContextTokens = Math.max(0, activeContextTokens);
        this.durationMs = durationMs;
        this.workLogJson = workLogJson == null ? "[]" : workLogJson;
        this.createdAt = createdAt;
    }

    public String getMessageId() {
        return messageId;
    }

    public int getSequence() {
        return sequence;
    }

    public String getParentMessageId() { return parentMessageId; }
    public int getMessageDepth() { return messageDepth; }
    public boolean isActivePath() { return activePath; }

    public String getRole() {
        return role;
    }

    public String getContent() {
        return content;
    }

    public String getModel() {
        return model;
    }

    public TokenUsageResponse getUsage() {
        return usage;
    }

    public int getActiveContextTokens() {
        return activeContextTokens;
    }

    public long getDurationMs() {
        return durationMs;
    }

    public String getWorkLogJson() {
        return workLogJson;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
