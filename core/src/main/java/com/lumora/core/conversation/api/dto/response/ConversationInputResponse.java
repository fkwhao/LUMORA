package com.lumora.core.conversation.api.dto.response;

import com.lumora.core.conversation.domain.entity.ConversationInput;
import com.lumora.core.conversation.application.support.MessageAttachmentJson;
import com.lumora.core.conversation.domain.model.MessageAttachment;

import java.time.Instant;
import java.util.List;

public record ConversationInputResponse(
        String inputId,
        String taskId,
        String runId,
        String target,
        String status,
        String content,
        List<MessageAttachment> attachments,
        String model,
        String reasoningEffort,
        String workspacePath,
        String permissionMode,
        long position,
        Instant createdAt,
        Instant updatedAt
) {
    public static ConversationInputResponse from(ConversationInput input) {
        return new ConversationInputResponse(
                input.getInputId(), input.getTaskId(), input.getRunId(),
                input.getTarget().name(), input.getStatus().name(),
                input.getContent(),
                MessageAttachmentJson.decode(input.getAttachmentsJson()),
                input.getModel(),
                input.getReasoningEffort(), input.getWorkspacePath(),
                input.getPermissionMode(), input.getPosition(),
                input.getCreatedAt(), input.getUpdatedAt()
        );
    }
}
