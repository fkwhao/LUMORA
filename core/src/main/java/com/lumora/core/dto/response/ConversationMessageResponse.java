package com.lumora.core.dto.response;

import com.lumora.core.entity.ConversationMessage;

import java.time.Instant;

public class ConversationMessageResponse {

    private final String messageId;
    private final int sequence;
    private final String role;
    private final String content;
    private final String reasoningContent;
    private final String model;
    private final TokenUsageResponse usage;
    private final long durationMs;
    private final Instant createdAt;

    public ConversationMessageResponse(
            String messageId,
            int sequence,
            String role,
            String content,
            String reasoningContent,
            String model,
            TokenUsageResponse usage,
            long durationMs,
            Instant createdAt
    ) {
        this.messageId = messageId;
        this.sequence = sequence;
        this.role = role;
        this.content = content;
        this.reasoningContent = reasoningContent;
        this.model = model;
        this.usage = usage;
        this.durationMs = durationMs;
        this.createdAt = createdAt;
    }

    public static ConversationMessageResponse fromEntity(
            ConversationMessage message
    ) {
        return new ConversationMessageResponse(
                message.getMessageId(),
                message.getSequence(),
                message.getRole().name().toLowerCase(),
                message.getContent(),
                message.getReasoningContent(),
                message.getModel(),
                new TokenUsageResponse(
                        message.getPromptTokens(),
                        message.getCompletionTokens(),
                        message.getTotalTokens()
                ),
                message.getDurationMs(),
                message.getCreatedAt()
        );
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

    public String getReasoningContent() {
        return reasoningContent;
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

    public Instant getCreatedAt() {
        return createdAt;
    }
}
