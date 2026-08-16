package com.lumora.core.conversation.domain.model;

import java.util.EnumSet;
import java.util.Set;

/** Durable lifecycle of one logical Agent run. */
public enum ConversationRunStatus {
    QUEUED,
    RUNNING,
    PAUSING,
    PAUSED,
    WAITING_APPROVAL,
    COMPLETED,
    FAILED,
    CANCELLED;

    private static final Set<ConversationRunStatus> ACTIVE = EnumSet.of(
            QUEUED,
            RUNNING,
            PAUSING,
            PAUSED,
            WAITING_APPROVAL
    );

    public boolean isActive() {
        return ACTIVE.contains(this);
    }

    public boolean isTerminal() {
        return this == COMPLETED || this == FAILED || this == CANCELLED;
    }
}
