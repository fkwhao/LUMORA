package com.lumora.core.conversation.api.dto.response;

import com.lumora.core.conversation.domain.entity.ConversationInput;

import java.time.Instant;

public record ConversationInputResponse(
        String inputId,
        String taskId,
        String runId,
        String target,
        String status,
        String content,
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
                input.getContent(), input.getModel(),
                input.getReasoningEffort(), input.getWorkspacePath(),
                input.getPermissionMode(), input.getPosition(),
                input.getCreatedAt(), input.getUpdatedAt()
        );
    }
}
