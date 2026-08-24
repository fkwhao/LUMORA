package com.lumora.core.agent.dto.request;

import com.lumora.core.conversation.domain.model.AgentInboxSnapshot;

public class AgentInboxMessageRequest {
    private final String messageId;
    private final long sequence;
    private final String senderAgentId;
    private final String senderLabel;
    private final String content;
    private final String status;
    private final String messageKind;

    public AgentInboxMessageRequest(AgentInboxSnapshot snapshot) {
        this.messageId = snapshot.messageId();
        this.sequence = snapshot.sequence();
        this.senderAgentId = snapshot.senderAgentId();
        this.senderLabel = snapshot.senderLabel();
        this.content = snapshot.content();
        this.status = snapshot.status();
        this.messageKind = snapshot.messageKind();
    }

    public String getMessageId() { return messageId; }
    public long getSequence() { return sequence; }
    public String getSenderAgentId() { return senderAgentId; }
    public String getSenderLabel() { return senderLabel; }
    public String getContent() { return content; }
    public String getStatus() { return status; }
    public String getMessageKind() { return messageKind; }
}
