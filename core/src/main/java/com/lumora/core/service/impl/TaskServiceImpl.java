package com.lumora.core.service.impl;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.lumora.core.agent.client.AgentRuntimeClient;
import com.lumora.core.agent.exception.AgentRuntimeException;
import com.lumora.core.agent.model.AgentPlanStep;
import com.lumora.core.common.TaskIdGenerator;
import com.lumora.core.entity.AgentTask;
import com.lumora.core.entity.TaskPlanStep;
import com.lumora.core.entity.TaskStatus;
import com.lumora.core.exception.IllegalTaskTransitionException;
import com.lumora.core.exception.TaskNotFoundException;
import com.lumora.core.mapper.TaskMapper;
import com.lumora.core.mapper.TaskPlanStepMapper;
import com.lumora.core.service.TaskService;
import com.lumora.core.task.model.TaskDetails;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Objects;

@Service
public class TaskServiceImpl implements TaskService {

    private final TaskMapper taskMapper;
    private final TaskPlanStepMapper taskPlanStepMapper;
    private final AgentRuntimeClient agentRuntimeClient;
    private final Clock clock;
    private final TaskIdGenerator taskIdGenerator;

    public TaskServiceImpl(
            TaskMapper taskMapper,
            TaskPlanStepMapper taskPlanStepMapper,
            AgentRuntimeClient agentRuntimeClient,
            Clock clock,
            TaskIdGenerator taskIdGenerator
    ) {
        this.taskMapper = taskMapper;
        this.taskPlanStepMapper = taskPlanStepMapper;
        this.agentRuntimeClient = agentRuntimeClient;
        this.clock = clock;
        this.taskIdGenerator = taskIdGenerator;
    }

    @Override
    @Transactional
    public TaskDetails createTask(String goal, String correlationId) {
        String normalizedGoal = Objects.requireNonNull(goal, "goal").trim();
        if (normalizedGoal.isEmpty()) {
            throw new IllegalArgumentException("任务目标不能为空");
        }
        if (correlationId == null || correlationId.isBlank()) {
            throw new IllegalArgumentException("关联 ID 不能为空");
        }

        Instant now = clock.instant();
        String taskId = taskIdGenerator.generate();
        List<AgentPlanStep> agentPlan = agentRuntimeClient.planTask(
                taskId,
                normalizedGoal,
                correlationId
        );
        if (agentPlan.isEmpty()) {
            throw new AgentRuntimeException("Python Agent 返回了空任务计划");
        }

        AgentTask task = new AgentTask(
                taskId,
                normalizedGoal,
                TaskStatus.PLANNING,
                0L,
                agentPlan.getFirst().getTitle(),
                "",
                "",
                now,
                now
        );
        taskMapper.insert(task);
        List<TaskPlanStep> planSteps = persistPlan(taskId, agentPlan);
        return new TaskDetails(task, planSteps);
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
        if (currentStatus == TaskStatus.CREATED) {
            return nextStatus == TaskStatus.PLANNING
                    || nextStatus == TaskStatus.INTERRUPTED
                    || nextStatus == TaskStatus.FAILED;
        }
        if (currentStatus == TaskStatus.PLANNING) {
            return nextStatus == TaskStatus.RUNNING
                    || nextStatus == TaskStatus.INTERRUPTED
                    || nextStatus == TaskStatus.FAILED;
        }
        if (currentStatus == TaskStatus.RUNNING) {
            return nextStatus == TaskStatus.WAITING_APPROVAL
                    || nextStatus == TaskStatus.COMPLETED
                    || nextStatus == TaskStatus.INTERRUPTED
                    || nextStatus == TaskStatus.FAILED;
        }
        if (currentStatus == TaskStatus.WAITING_APPROVAL) {
            return nextStatus == TaskStatus.RUNNING
                    || nextStatus == TaskStatus.COMPLETED
                    || nextStatus == TaskStatus.REJECTED
                    || nextStatus == TaskStatus.INTERRUPTED
                    || nextStatus == TaskStatus.FAILED;
        }
        return false;
    }
}
