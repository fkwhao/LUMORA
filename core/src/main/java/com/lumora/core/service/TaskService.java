package com.lumora.core.service;

import com.lumora.core.entity.AgentTask;
import com.lumora.core.entity.TaskStatus;
import com.lumora.core.task.model.TaskDetails;

import java.util.List;

/**
 * 任务业务入口，Controller 和其他适配器都必须通过该接口操作任务。
 */
public interface TaskService {

    /**
     * 请求 Python Agent 规划任务，并原子保存任务和计划步骤。
     *
     * @param goal 用户任务目标
     * @param correlationId 全链路关联 ID
     * @return 新任务及其计划步骤
     * @throws IllegalArgumentException 请求参数无效
     */
    TaskDetails createTask(String goal, String correlationId);

    /**
     * 查询任务和按顺序排列的计划步骤。
     *
     * @param taskId 任务 ID
     * @return 任务详情
     */
    TaskDetails getTaskDetails(String taskId);

    /**
     * 按最近更新时间倒序查询全部任务。
     *
     * @return 任务列表
     */
    List<AgentTask> listTasks();

    /**
     * 查询单个任务。
     *
     * @param taskId 任务 ID
     * @return 任务实体
     * @throws com.lumora.core.exception.TaskNotFoundException 任务不存在
     */
    AgentTask getTask(String taskId);

    /**
     * 刷新任务最近活动时间。
     *
     * @param taskId 任务 ID
     */
    void touchTask(String taskId);

    AgentTask updateComposerPreferences(
            String taskId,
            String model,
            String reasoningEffort
    );

    /**
     * 按领域状态机流转任务状态。
     *
     * @param taskId 任务 ID
     * @param nextStatus 目标状态
     * @return 更新后的任务
     * @throws com.lumora.core.exception.IllegalTaskTransitionException
     *         当前状态不允许进入目标状态
     */
    AgentTask transitionTask(String taskId, TaskStatus nextStatus);
}
