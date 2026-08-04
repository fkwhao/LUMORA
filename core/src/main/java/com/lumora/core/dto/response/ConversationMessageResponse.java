package com.lumora.core.dto.response;

import java.time.Instant;

public class ConversationMessageResponse {

    private final String messageId;
    private final int sequence;
    private final String role;
    private final String content;
    private final String model;
    private final TokenUsageResponse usage;
    private final long durationMs;
    private final String workLogJson;
    private final Instant createdAt;

    public ConversationMessageResponse(
            String messageId,
            int sequence,
            String role,
            String content,
            String model,
            TokenUsageResponse usage,
            long durationMs,
            String workLogJson,
            Instant createdAt
    ) {
        this.messageId = messageId;
        this.sequence = sequence;
        this.role = role;
        this.content = content;
        this.model = model;
        this.usage = usage;
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
