package com.lumora.core.task.application.service;

import com.lumora.core.agent.client.AgentRuntimeClient;
import com.lumora.core.agent.model.AgentPlanStep;
import com.lumora.core.task.domain.model.TaskIdGenerator;
import com.lumora.core.task.domain.entity.AgentTask;
import com.lumora.core.task.domain.entity.TaskPlanStep;
import com.lumora.core.task.domain.model.TaskStatus;
import com.lumora.core.task.domain.exception.IllegalTaskTransitionException;
import com.lumora.core.task.infrastructure.persistence.TaskMapper;
import com.lumora.core.task.infrastructure.persistence.TaskPlanStepMapper;
import com.lumora.core.task.application.service.TaskService;
import com.lumora.core.task.application.service.impl.TaskServiceImpl;
import com.lumora.core.task.domain.model.TaskDetails;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TaskServiceTest {

    private static final String TASK_ID =
            "11111111-1111-1111-1111-111111111111";
    private static final String CORRELATION_ID = "correlation-123";
    private static final Instant NOW = Instant.parse("2026-07-24T00:00:00Z");

    private final Map<String, AgentTask> tasks = new LinkedHashMap<>();
    private final List<TaskPlanStep> planSteps = new ArrayList<>();
    private TaskMapper mapper;
    private TaskPlanStepMapper planStepMapper;
    private AgentRuntimeClient agentRuntimeClient;
    private TaskService service;

    @BeforeEach
    void setUp() {
        mapper = mock(TaskMapper.class);
        when(mapper.selectById(anyString()))
                .thenAnswer(invocation -> tasks.get(invocation.getArgument(0)));
        doAnswer(invocation -> {
            AgentTask task = invocation.getArgument(0);
            tasks.put(task.getTaskId(), task);
            return 1;
        }).when(mapper).insert(any(AgentTask.class));
        doAnswer(invocation -> {
            AgentTask task = invocation.getArgument(0);
            tasks.put(task.getTaskId(), task);
            return 1;
        }).when(mapper).updateById(any(AgentTask.class));
        planStepMapper = mock(TaskPlanStepMapper.class);
        doAnswer(invocation -> {
            planSteps.add(invocation.getArgument(0));
            return 1;
        }).when(planStepMapper).insert(any(TaskPlanStep.class));
        agentRuntimeClient = mock(AgentRuntimeClient.class);
        when(agentRuntimeClient.planTask(
                anyString(),
                anyString(),
                anyString()
        )).thenReturn(agentPlan());
        service = new TaskServiceImpl(
                mapper,
                planStepMapper,
                agentRuntimeClient,
                Clock.fixed(NOW, ZoneOffset.UTC),
                new FixedTaskIdGenerator(TASK_ID)
        );
    }

    @Test
    void createsAndPersistsATask() {
        TaskDetails details = service.createTask(
                "  整理下载目录  ",
                "  F:\\project\\test  ",
                CORRELATION_ID
        );
        AgentTask task = details.getTask();

        assertThat(task.getTaskId()).isEqualTo(TASK_ID);
        assertThat(task.getGoal()).isEqualTo("整理下载目录");
        assertThat(task.getStatus()).isEqualTo(TaskStatus.PLANNING);
        assertThat(task.getActiveStep()).isEqualTo("扫描下载目录");
        assertThat(task.getWorkspacePath()).isEqualTo("F:\\project\\test");
        assertThat(mapper.selectById(TASK_ID)).isSameAs(task);
        verify(agentRuntimeClient).planTask(
                TASK_ID,
                "整理下载目录",
                CORRELATION_ID
        );
        assertThat(details.getPlanSteps()).hasSize(2);
        assertThat(planSteps)
                .extracting(
                        TaskPlanStep::getStepIndex,
                        TaskPlanStep::getStepId,
                        TaskPlanStep::isRequiresApproval
                )
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(
                                0,
                                "scan",
                                false
                        ),
                        org.assertj.core.groups.Tuple.tuple(
                                1,
                                "move",
                                true
                        )
                );
    }

    @Test
    void updatesThePersistedWorkspaceWithoutChangingTaskIdentity() {
        AgentTask task = service.createTask(
                "整理下载目录",
                CORRELATION_ID
        ).getTask();

        AgentTask updated = service.updateWorkspacePath(
                TASK_ID,
                "  F:\\project\\LUMORA  "
        );

        assertThat(updated).isSameAs(task);
        assertThat(updated.getTaskId()).isEqualTo(TASK_ID);
        assertThat(updated.getWorkspacePath())
                .isEqualTo("F:\\project\\LUMORA");
        assertThat(mapper.selectById(TASK_ID)).isSameAs(updated);
    }

    @Test
    void followsTheApprovalTaskPath() {
        service.createTask("整理下载目录", CORRELATION_ID);

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
        service.createTask("整理下载目录", CORRELATION_ID);

        assertThatThrownBy(
                () -> service.transitionTask(TASK_ID, TaskStatus.COMPLETED)
        )
                .isInstanceOf(IllegalTaskTransitionException.class)
                .hasMessageContaining("PLANNING -> COMPLETED");
    }

    @Test
    void rejectsABlankGoal() {
        assertThatThrownBy(
                () -> service.createTask("   ", CORRELATION_ID)
        )
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("不能为空");
    }

    @Test
    void interruptionPreservesTaskIdentityAndGoal() {
        AgentTask task = service.createTask(
                "整理下载目录",
                CORRELATION_ID
        ).getTask();

        AgentTask interrupted = service.transitionTask(
                TASK_ID,
                TaskStatus.INTERRUPTED
        );

        assertThat(interrupted.getTaskId()).isEqualTo(task.getTaskId());
        assertThat(interrupted.getGoal()).isEqualTo(task.getGoal());
        assertThat(interrupted.getStatus()).isEqualTo(TaskStatus.INTERRUPTED);
    }

    private static List<AgentPlanStep> agentPlan() {
        return List.of(
                new AgentPlanStep(
                        "scan",
                        "扫描下载目录",
                        "读取待整理文件",
                        false
                ),
                new AgentPlanStep(
                        "move",
                        "移动文件",
                        "按分类移动文件",
                        true
                )
        );
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
