package com.lumora.core.task.domain.exception;

import com.lumora.core.task.domain.model.TaskStatus;

public class IllegalTaskTransitionException extends IllegalStateException {

    public IllegalTaskTransitionException(
            TaskStatus currentStatus,
            TaskStatus nextStatus
    ) {
        super("非法任务状态转换: " + currentStatus + " -> " + nextStatus);
    }
}
