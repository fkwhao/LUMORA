package com.lumora.core.exception;

import com.lumora.core.entity.TaskStatus;

public class IllegalTaskTransitionException extends IllegalStateException {

    public IllegalTaskTransitionException(
            TaskStatus currentStatus,
            TaskStatus nextStatus
    ) {
        super("非法任务状态转换: " + currentStatus + " -> " + nextStatus);
    }
}
