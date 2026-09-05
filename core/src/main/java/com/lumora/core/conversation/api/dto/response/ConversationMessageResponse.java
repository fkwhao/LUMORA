package com.lumora.core.conversation.api.dto.response;

import java.time.Instant;
import java.util.List;
import com.lumora.core.conversation.domain.model.MessageAttachment;

public class ConversationMessageResponse {

    private final String messageId;
    private final String runId;
    private final int sequence;
    private final String parentMessageId;
    private final int messageDepth;
    private final boolean activePath;
    private final boolean usageRecordOnly;
    private final String role;
    private final String content;
    private final List<MessageAttachment> attachments;
    private final String model;
    private final TokenUsageResponse usage;
    private final int activeContextTokens;
    private final boolean activeContextEstimated;
    private final long durationMs;
    private final String workLogJson;
    private final Instant createdAt;

    public ConversationMessageResponse(
            String messageId,
            String runId,
            int sequence,
            String parentMessageId,
            int messageDepth,
            boolean activePath,
            boolean usageRecordOnly,
            String role,
            String content,
            List<MessageAttachment> attachments,
            String model,
            TokenUsageResponse usage,
            int activeContextTokens,
            boolean activeContextEstimated,
            long durationMs,
            String workLogJson,
            Instant createdAt
    ) {
        this.messageId = messageId;
        this.runId = runId == null ? "" : runId;
        this.sequence = sequence;
        this.parentMessageId = parentMessageId;
        this.messageDepth = messageDepth;
        this.activePath = activePath;
        this.usageRecordOnly = usageRecordOnly;
        this.role = role;
        this.content = content;
        this.attachments = List.copyOf(attachments);
        this.model = model;
        this.usage = usage;
        this.activeContextTokens = Math.max(0, activeContextTokens);
        this.activeContextEstimated = activeContextEstimated;
        this.durationMs = durationMs;
        this.workLogJson = workLogJson == null ? "[]" : workLogJson;
        this.createdAt = createdAt;
    }

    public String getMessageId() {
        return messageId;
    }

    public String getRunId() { return runId; }

    public int getSequence() {
        return sequence;
    }

    public String getParentMessageId() { return parentMessageId; }
    public int getMessageDepth() { return messageDepth; }
    public boolean isActivePath() { return activePath; }
    public boolean isUsageRecordOnly() { return usageRecordOnly; }

    public String getRole() {
        return role;
    }

    public String getContent() {
        return content;
    }

    public List<MessageAttachment> getAttachments() { return attachments; }

    public String getModel() {
        return model;
    }

    public TokenUsageResponse getUsage() {
        return usage;
    }

    public int getActiveContextTokens() {
        return activeContextTokens;
    }

    public boolean isActiveContextEstimated() {
        return activeContextEstimated;
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
