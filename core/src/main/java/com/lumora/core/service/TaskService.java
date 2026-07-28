package com.lumora.core.service;

import com.lumora.core.entity.AgentTask;
import com.lumora.core.entity.TaskStatus;
import com.lumora.core.task.model.TaskDetails;

/**
 * 任务业务入口，Controller 和其他适配器都必须通过该接口操作任务。
 */
public interface TaskService {

    TaskDetails createTask(String goal, String correlationId);

    TaskDetails getTaskDetails(String taskId);

    AgentTask getTask(String taskId);

    AgentTask transitionTask(String taskId, TaskStatus nextStatus);
}
