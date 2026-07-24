package com.lumora.core.task;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TaskServiceTest {

    private static final UUID TASK_ID =
            UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final Instant NOW = Instant.parse("2026-07-24T00:00:00Z");

    private final TaskService service = new TaskService(
            Clock.fixed(NOW, ZoneOffset.UTC),
            () -> TASK_ID
    );

    @Test
    void followsTheApprovalTaskPath() {
        AgentTask task = service.create("整理下载目录");

        task = service.transition(task, TaskStatus.PLANNING);
        task = service.transition(task, TaskStatus.RUNNING);
        task = service.transition(task, TaskStatus.WAITING_APPROVAL);
        task = service.transition(task, TaskStatus.COMPLETED);

        assertThat(task.id()).isEqualTo(TASK_ID);
        assertThat(task.status()).isEqualTo(TaskStatus.COMPLETED);
    }

    @Test
    void rejectsAnIllegalDirectCompletion() {
        AgentTask task = service.create("整理下载目录");

        assertThatThrownBy(() -> service.transition(task, TaskStatus.COMPLETED))
                .isInstanceOf(IllegalTaskTransitionException.class)
                .hasMessageContaining("CREATED -> COMPLETED");
    }

    @Test
    void rejectsABlankGoal() {
        assertThatThrownBy(() -> service.create("   "))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("must not be blank");
    }
}

