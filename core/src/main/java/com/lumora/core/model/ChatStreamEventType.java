package com.lumora.core.model;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

public enum ChatStreamEventType {
    TEXT_DELTA("text_delta"),
    REASONING_DELTA("reasoning_delta"),
    PROGRESS_MESSAGE("progress_message"),
    TOOL_STARTED("tool_started"),
    TOOL_COMPLETED("tool_completed"),
    TOOL_FAILED("tool_failed"),
    TOOL_APPROVAL_REQUESTED("tool_approval_requested"),
    TOOL_APPROVAL_RESOLVED("tool_approval_resolved"),
    CONTEXT_COMPACTION_STARTED("context_compaction_started"),
    CONTEXT_COMPACTION_PROGRESS("context_compaction_progress"),
    CONTEXT_COMPACTED("context_compacted"),
    CONTEXT_COMPACTION_FAILED("context_compaction_failed"),
    USAGE("usage"),
    COMPLETED("completed"),
    FAILED("failed");

    private final String value;

    ChatStreamEventType(String value) {
        this.value = value;
    }

    @JsonCreator
    public static ChatStreamEventType fromValue(String value) {
        for (ChatStreamEventType type : values()) {
            if (type.value.equals(value)) {
                return type;
            }
        }
        throw new IllegalArgumentException("未知流事件类型");
    }

    @JsonValue
    public String getValue() {
        return value;
    }
}
