package com.lumora.core.conversation.domain.model;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

public enum ChatStreamEventType {
    TEXT_DELTA("text_delta"),
    TEXT_RESET("text_reset"),
    REASONING_DELTA("reasoning_delta"),
    PROTOCOL_MESSAGE("protocol_message"),
    PROGRESS_MESSAGE("progress_message"),
    AGENT_STARTED("agent_started"),
    AGENT_EVENT("agent_event"),
    AGENT_COMPLETED("agent_completed"),
    AGENT_FAILED("agent_failed"),
    TOOL_STARTED("tool_started"),
    TOOL_COMPLETED("tool_completed"),
    TOOL_FAILED("tool_failed"),
    TOOL_APPROVAL_REQUESTED("tool_approval_requested"),
    TOOL_APPROVAL_RESOLVED("tool_approval_resolved"),
    APPROVAL_REVIEW_STARTED("approval_review_started"),
    APPROVAL_REVIEW_COMPLETED("approval_review_completed"),
    CONTEXT_COMPACTION_STARTED("context_compaction_started"),
    CONTEXT_COMPACTION_PROGRESS("context_compaction_progress"),
    CONTEXT_COMPACTED("context_compacted"),
    CONTEXT_COMPACTION_FAILED("context_compaction_failed"),
    WEB_SEARCH_STARTED("web_search_started"),
    WEB_SEARCH_PROGRESS("web_search_progress"),
    WEB_SEARCH_COMPLETED("web_search_completed"),
    WEB_SEARCH_FAILED("web_search_failed"),
    USAGE("usage"),
    STEER_CLAIMED("steer_claimed"),
    PAUSED("paused"),
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
