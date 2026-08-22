package com.lumora.core.conversation.domain.model;

/** Durable lifecycle of the Git-backed file changes owned by one Run. */
public enum RunChangeSetStatus {
    TRACKING,
    COLLIDED,
    CAPTURED,
    REVERTED,
    UNAVAILABLE
}
