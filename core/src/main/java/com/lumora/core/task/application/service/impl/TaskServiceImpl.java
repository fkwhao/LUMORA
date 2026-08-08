package com.lumora.core.task.application.service.impl;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.lumora.core.agent.client.AgentRuntimeClient;
import com.lumora.core.agent.exception.AgentRuntimeException;
import com.lumora.core.agent.model.AgentPlanStep;
import com.lumora.core.task.domain.model.TaskIdGenerator;
import com.lumora.core.task.domain.entity.AgentTask;
import com.lumora.core.task.domain.entity.TaskPlanStep;
import com.lumora.core.task.domain.model.TaskStatus;
import com.lumora.core.task.domain.exception.IllegalTaskTransitionException;
import com.lumora.core.task.domain.exception.TaskNotFoundException;
import com.lumora.core.task.infrastructure.persistence.TaskMapper;
import com.lumora.core.task.infrastructure.persistence.TaskPlanStepMapper;
import com.lumora.core.task.application.service.TaskService;
import com.lumora.core.task.domain.model.TaskDetails;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;

/**
 * 任务领域服务，负责任务创建、计划落库与状态流转。
 */
@Service
@RequiredArgsConstructor
public class TaskServiceImpl implements TaskService {

    private final TaskMapper taskMapper;
    private final TaskPlanStepMapper taskPlanStepMapper;
    private final AgentRuntimeClient agentRuntimeClient;
    private final Clock clock;
    private final TaskIdGenerator taskIdGenerator;

    @Override
    @Transactional
    public TaskDetails createTask(String goal, String correlationId) {
        // 1. 校验请求并提前生成任务 ID，供 Java 与 Python 全链路关联。
        String normalizedGoal = requireText(goal, "任务目标");
        String normalizedCorrelationId = requireText(
                correlationId,
                "关联 ID"
        );
        String taskId = taskIdGenerator.generate();

        // 2. 请求 Agent 生成计划；空计划不允许形成无法执行的任务。
        List<AgentPlanStep> agentPlan = agentRuntimeClient.planTask(
                taskId,
                normalizedGoal,
                normalizedCorrelationId
        );
        if (agentPlan.isEmpty()) {
            throw new AgentRuntimeException("Python Agent 返回了空任务计划");
        }

        // 3. 任务和计划步骤在同一事务内落库。
        AgentTask task = newPlanningTask(
                taskId,
                normalizedGoal,
                agentPlan.getFirst(),
                clock.instant()
        );
        taskMapper.insert(task);
        List<TaskPlanStep> planSteps = persistPlan(taskId, agentPlan);
        return new TaskDetails(task, planSteps);
    }

    private AgentTask newPlanningTask(
            String taskId,
            String goal,
            AgentPlanStep firstStep,
            Instant now
    ) {
        return new AgentTask(
                taskId,
                goal,
                TaskStatus.PLANNING,
                0L,
                firstStep.getTitle(),
                "",
                "",
                now,
                now
        );
    }

    @Override
    @Transactional(readOnly = true)
    public TaskDetails getTaskDetails(String taskId) {
        AgentTask task = getTask(taskId);
        List<TaskPlanStep> planSteps = taskPlanStepMapper.selectList(
                Wrappers.<TaskPlanStep>lambdaQuery()
                        .eq(TaskPlanStep::getTaskId, taskId)
                        .orderByAsc(TaskPlanStep::getStepIndex)
        );
        return new TaskDetails(task, planSteps);
    }

    @Override
    @Transactional(readOnly = true)
    public List<AgentTask> listTasks() {
        return taskMapper.selectList(
                Wrappers.<AgentTask>lambdaQuery()
                        .orderByDesc(AgentTask::getUpdatedAt)
        );
    }

    @Override
    @Transactional(readOnly = true)
    public AgentTask getTask(String taskId) {
        if (taskId == null || taskId.isBlank()) {
            throw new IllegalArgumentException("任务 ID 不能为空");
        }
        AgentTask task = taskMapper.selectById(taskId);
        if (task == null) {
            throw new TaskNotFoundException(taskId);
        }
        return task;
    }

    @Override
    @Transactional
    public void touchTask(String taskId) {
        AgentTask task = getTask(taskId);
        task.setUpdatedAt(clock.instant());
        taskMapper.updateById(task);
    }

    @Override
    @Transactional
    public AgentTask updateComposerPreferences(
            String taskId,
            String model,
            String reasoningEffort
    ) {
        AgentTask task = getTask(taskId);
        task.setSelectedModel(requireText(model, "模型"));
        task.setSelectedReasoningEffort(
                reasoningEffort == null ? "" : reasoningEffort.trim()
        );
        task.setUpdatedAt(clock.instant());
        taskMapper.updateById(task);
        return task;
    }

    @Override
    @Transactional
    public AgentTask transitionTask(String taskId, TaskStatus nextStatus) {
        AgentTask task = getTask(taskId);
        TaskStatus currentStatus = task.getStatus();
        if (!isAllowedTransition(currentStatus, nextStatus)) {
            throw new IllegalTaskTransitionException(
                    currentStatus,
                    nextStatus
            );
        }

        task.setStatus(nextStatus);
        task.setUpdatedAt(clock.instant());
        taskMapper.updateById(task);
        return task;
    }

    private List<TaskPlanStep> persistPlan(
            String taskId,
            List<AgentPlanStep> agentPlan
    ) {
        List<TaskPlanStep> planSteps = java.util.stream.IntStream
                .range(0, agentPlan.size())
                .mapToObj(index -> toEntity(
                        taskId,
                        index,
                        agentPlan.get(index)
                ))
                .toList();
        for (TaskPlanStep planStep : planSteps) {
            taskPlanStepMapper.insert(planStep);
        }
        return planSteps;
    }

    private TaskPlanStep toEntity(
            String taskId,
            int index,
            AgentPlanStep step
    ) {
        return new TaskPlanStep(
                taskId,
                index,
                step.getStepId(),
                step.getTitle(),
                step.getDescription(),
                step.isRequiresApproval()
        );
    }

    /**
     * 状态规则集中在 Service，防止 REST、Agent Client 和 Mapper 各自维护一份。
     */
    private boolean isAllowedTransition(
            TaskStatus currentStatus,
            TaskStatus nextStatus
    ) {
        return switch (currentStatus) {
            case CREATED -> nextStatus == TaskStatus.PLANNING
                    || nextStatus == TaskStatus.INTERRUPTED
                    || nextStatus == TaskStatus.FAILED;
            case PLANNING -> nextStatus == TaskStatus.RUNNING
                    || nextStatus == TaskStatus.INTERRUPTED
                    || nextStatus == TaskStatus.FAILED;
            case RUNNING -> nextStatus == TaskStatus.WAITING_APPROVAL
                    || nextStatus == TaskStatus.COMPLETED
                    || nextStatus == TaskStatus.INTERRUPTED
                    || nextStatus == TaskStatus.FAILED;
            case WAITING_APPROVAL -> nextStatus == TaskStatus.RUNNING
                    || nextStatus == TaskStatus.COMPLETED
                    || nextStatus == TaskStatus.REJECTED
                    || nextStatus == TaskStatus.INTERRUPTED
                    || nextStatus == TaskStatus.FAILED;
            default -> false;
        };
    }

    private String requireText(String value, String label) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(label + "不能为空");
        }
        return value.trim();
    }
}
