package com.lumora.core.task.domain.model;

public enum WorktreeState {
    PROVISIONING,
    ACTIVE,
    WAITING_REVIEW,
    APPLYING,
    CONFLICTED,
    CLEANUP_PENDING,
    BRANCHED,
    RELEASED,
    REMOVED,
    FAILED;

    public boolean retainsWorkspace() {
        return switch (this) {
            case PROVISIONING, ACTIVE, WAITING_REVIEW, APPLYING,
                    CONFLICTED, CLEANUP_PENDING, BRANCHED -> true;
            case RELEASED, REMOVED, FAILED -> false;
        };
    }
}
