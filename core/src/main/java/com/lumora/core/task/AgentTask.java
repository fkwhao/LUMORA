package com.lumora.core.task;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record AgentTask(
        UUID id,
        String goal,
        TaskStatus status,
        Instant createdAt,
        Instant updatedAt,
        String resultSummary,
        String failureReason
) {
    public AgentTask {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(goal, "goal");
        Objects.requireNonNull(status, "status");
        Objects.requireNonNull(createdAt, "createdAt");
        Objects.requireNonNull(updatedAt, "updatedAt");
    }

    public AgentTask withStatus(TaskStatus nextStatus, Instant changedAt) {
        return new AgentTask(
                id,
                goal,
                nextStatus,
                createdAt,
                changedAt,
                resultSummary,
                failureReason
        );
    }
}

