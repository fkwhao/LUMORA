package com.lumora.core.agent.dto.request;

import com.lumora.core.conversation.domain.model.MessageAttachment;

public record AgentMessageAttachmentRequest(
        String attachmentId,
        String name,
        String mimeType,
        long size,
        String path,
        String kind,
        String source
) {
    public AgentMessageAttachmentRequest(MessageAttachment attachment) {
        this(
                attachment.attachmentId(),
                attachment.name(),
                attachment.mimeType(),
                attachment.size(),
                attachment.path(),
                attachment.kind().name(),
                attachment.source().name()
        );
    }
}
