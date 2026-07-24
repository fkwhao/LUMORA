package com.lumora.core.service;

import com.lumora.core.entity.AgentTask;
import com.lumora.core.entity.TaskStatus;

/**
 * 任务业务入口，Controller 和 gRPC 适配器都必须通过该接口操作任务。
 */
public interface TaskService {

    AgentTask createTask(String goal);

    AgentTask getTask(String taskId);

    AgentTask transitionTask(String taskId, TaskStatus nextStatus);
}
