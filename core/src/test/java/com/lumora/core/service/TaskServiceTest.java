package com.lumora.core.service;

import com.lumora.core.common.TaskIdGenerator;
import com.lumora.core.entity.AgentTask;
import com.lumora.core.entity.TaskStatus;
import com.lumora.core.exception.IllegalTaskTransitionException;
import com.lumora.core.mapper.TaskMapper;
import com.lumora.core.service.impl.TaskServiceImpl;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TaskServiceTest {

    private static final String TASK_ID =
            "11111111-1111-1111-1111-111111111111";
    private static final Instant NOW = Instant.parse("2026-07-24T00:00:00Z");

    private final InMemoryTaskMapper mapper = new InMemoryTaskMapper();
    private final TaskService service = new TaskServiceImpl(
            mapper,
            Clock.fixed(NOW, ZoneOffset.UTC),
            new FixedTaskIdGenerator(TASK_ID)
    );

    @Test
    void createsAndPersistsATask() {
        AgentTask task = service.createTask("  整理下载目录  ");

        assertThat(task.getTaskId()).isEqualTo(TASK_ID);
        assertThat(task.getGoal()).isEqualTo("整理下载目录");
        assertThat(task.getStatus()).isEqualTo(TaskStatus.CREATED);
        assertThat(mapper.findById(TASK_ID)).contains(task);
    }

    @Test
    void followsTheApprovalTaskPath() {
        service.createTask("整理下载目录");

        service.transitionTask(TASK_ID, TaskStatus.PLANNING);
        service.transitionTask(TASK_ID, TaskStatus.RUNNING);
        service.transitionTask(TASK_ID, TaskStatus.WAITING_APPROVAL);
        AgentTask completed = service.transitionTask(
                TASK_ID,
                TaskStatus.COMPLETED
        );

        assertThat(completed.getTaskId()).isEqualTo(TASK_ID);
        assertThat(completed.getStatus()).isEqualTo(TaskStatus.COMPLETED);
    }

    @Test
    void rejectsAnIllegalDirectCompletion() {
        service.createTask("整理下载目录");

        assertThatThrownBy(
                () -> service.transitionTask(TASK_ID, TaskStatus.COMPLETED)
        )
                .isInstanceOf(IllegalTaskTransitionException.class)
                .hasMessageContaining("CREATED -> COMPLETED");
    }

    @Test
    void rejectsABlankGoal() {
        assertThatThrownBy(() -> service.createTask("   "))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("不能为空");
    }

    @Test
    void interruptionPreservesTaskIdentityAndGoal() {
        AgentTask task = service.createTask("整理下载目录");

        AgentTask interrupted = service.transitionTask(
                TASK_ID,
                TaskStatus.INTERRUPTED
        );

        assertThat(interrupted.getTaskId()).isEqualTo(task.getTaskId());
        assertThat(interrupted.getGoal()).isEqualTo(task.getGoal());
        assertThat(interrupted.getStatus()).isEqualTo(TaskStatus.INTERRUPTED);
    }

    static class InMemoryTaskMapper implements TaskMapper {

        private final Map<String, AgentTask> tasks = new LinkedHashMap<>();

        @Override
        public int insert(AgentTask task) {
            tasks.put(task.getTaskId(), task);
            return 1;
        }

        @Override
        public Optional<AgentTask> findById(String taskId) {
            return Optional.ofNullable(tasks.get(taskId));
        }

        @Override
        public int update(AgentTask task) {
            tasks.put(task.getTaskId(), task);
            return 1;
        }
    }

    static class FixedTaskIdGenerator extends TaskIdGenerator {

        private final String taskId;

        FixedTaskIdGenerator(String taskId) {
            this.taskId = taskId;
        }

        @Override
        public String generate() {
            return taskId;
        }
    }
}
