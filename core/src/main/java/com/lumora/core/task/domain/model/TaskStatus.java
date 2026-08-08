package com.lumora.core.task.domain.model;

public enum TaskStatus {
    CREATED,
    PLANNING,
    RUNNING,
    WAITING_APPROVAL,
    COMPLETED,
    REJECTED,
    INTERRUPTED,
    FAILED
}
