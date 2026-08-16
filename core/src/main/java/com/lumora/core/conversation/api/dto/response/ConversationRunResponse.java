package com.lumora.core.conversation.api.dto.response;

import com.lumora.core.conversation.domain.entity.ConversationRun;

import java.time.Instant;

public record ConversationRunResponse(
        String runId,
        String taskId,
        String status,
        String triggerType,
        long lastEventSequence,
        long replayFromSequence,
        String errorMessage,
        Instant createdAt,
        Instant startedAt,
        Instant updatedAt,
        Instant completedAt
) {
    public static ConversationRunResponse from(ConversationRun run) {
        return new ConversationRunResponse(
                run.getRunId(),
                run.getTaskId(),
                run.getStatus().name(),
                run.getTriggerType().name(),
                run.getLastEventSequence(),
                run.getReplayFromSequence(),
                run.getErrorMessage(),
                run.getCreatedAt(),
                run.getStartedAt(),
                run.getUpdatedAt(),
                run.getCompletedAt()
        );
    }
}
