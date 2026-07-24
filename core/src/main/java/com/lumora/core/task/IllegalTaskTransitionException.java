package com.lumora.core.task;

public final class IllegalTaskTransitionException extends IllegalStateException {

    public IllegalTaskTransitionException(TaskStatus current, TaskStatus next) {
        super("Illegal task transition: " + current + " -> " + next);
    }
}

