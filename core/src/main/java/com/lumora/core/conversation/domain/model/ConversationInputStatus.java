package com.lumora.core.conversation.domain.model;

public enum ConversationInputStatus {
    PENDING,
    DELIVERED,
    CLAIMED,
    CANCELLED;

    public boolean isEditable() {
        return this == PENDING || this == DELIVERED;
    }
}
