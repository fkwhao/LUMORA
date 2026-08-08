package com.lumora.core.task.domain.exception;

public class TaskNotFoundException extends RuntimeException {

    public TaskNotFoundException(String taskId) {
        super("任务不存在: " + taskId);
    }
}
