package com.lumora.core.service.impl;

import com.lumora.core.common.TaskIdGenerator;
import com.lumora.core.entity.AgentTask;
import com.lumora.core.entity.TaskStatus;
import com.lumora.core.exception.IllegalTaskTransitionException;
import com.lumora.core.exception.TaskNotFoundException;
import com.lumora.core.mapper.TaskMapper;
import com.lumora.core.service.TaskService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Objects;

@Service
public class TaskServiceImpl implements TaskService {

    private final TaskMapper taskMapper;
    private final Clock clock;
    private final TaskIdGenerator taskIdGenerator;

    public TaskServiceImpl(
            TaskMapper taskMapper,
            Clock clock,
            TaskIdGenerator taskIdGenerator
    ) {
        this.taskMapper = taskMapper;
        this.clock = clock;
        this.taskIdGenerator = taskIdGenerator;
    }

    @Override
    @Transactional
    public AgentTask createTask(String goal) {
        String normalizedGoal = Objects.requireNonNull(goal, "goal").trim();
        if (normalizedGoal.isEmpty()) {
            throw new IllegalArgumentException("任务目标不能为空");
        }

        Instant now = clock.instant();
        AgentTask task = new AgentTask(
                taskIdGenerator.generate(),
                normalizedGoal,
                TaskStatus.CREATED,
                0L,
                "",
                "",
                "",
                now,
                now
        );
        taskMapper.insert(task);
        return task;
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
