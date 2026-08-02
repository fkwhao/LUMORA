package com.lumora.core.model;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

public enum ChatStreamEventType {
    TEXT_DELTA("text_delta"),
    REASONING_DELTA("reasoning_delta"),
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
