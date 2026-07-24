package com.lumora.core.task;

import java.time.Clock;
import java.time.Instant;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;

public final class TaskService {

    private static final Map<TaskStatus, Set<TaskStatus>> ALLOWED_TRANSITIONS =
            createAllowedTransitions();

    private final Clock clock;
    private final Supplier<UUID> idSupplier;

    public TaskService(Clock clock, Supplier<UUID> idSupplier) {
        this.clock = Objects.requireNonNull(clock, "clock");
        this.idSupplier = Objects.requireNonNull(idSupplier, "idSupplier");
    }

    public AgentTask create(String goal) {
        String normalizedGoal = Objects.requireNonNull(goal, "goal").trim();
        if (normalizedGoal.isEmpty()) {
            throw new IllegalArgumentException("Task goal must not be blank.");
        }

        Instant now = clock.instant();
        return new AgentTask(
                idSupplier.get(),
                normalizedGoal,
                TaskStatus.CREATED,
                now,
                now,
                "",
                ""
        );
    }

    public AgentTask transition(AgentTask task, TaskStatus nextStatus) {
        Set<TaskStatus> allowed = ALLOWED_TRANSITIONS.getOrDefault(
                task.status(),
                Set.of()
        );
        if (!allowed.contains(nextStatus)) {
            throw new IllegalTaskTransitionException(task.status(), nextStatus);
        }
        return task.withStatus(nextStatus, clock.instant());
    }

    private static Map<TaskStatus, Set<TaskStatus>> createAllowedTransitions() {
        Map<TaskStatus, Set<TaskStatus>> transitions =
                new EnumMap<>(TaskStatus.class);
        transitions.put(TaskStatus.CREATED, EnumSet.of(
                TaskStatus.PLANNING,
                TaskStatus.INTERRUPTED,
                TaskStatus.FAILED
        ));
        transitions.put(TaskStatus.PLANNING, EnumSet.of(
                TaskStatus.RUNNING,
                TaskStatus.INTERRUPTED,
                TaskStatus.FAILED
        ));
        transitions.put(TaskStatus.RUNNING, EnumSet.of(
                TaskStatus.WAITING_APPROVAL,
                TaskStatus.COMPLETED,
                TaskStatus.INTERRUPTED,
                TaskStatus.FAILED
        ));
        transitions.put(TaskStatus.WAITING_APPROVAL, EnumSet.of(
                TaskStatus.RUNNING,
                TaskStatus.COMPLETED,
                TaskStatus.REJECTED,
                TaskStatus.INTERRUPTED,
                TaskStatus.FAILED
        ));
        return Map.copyOf(transitions);
    }
}

