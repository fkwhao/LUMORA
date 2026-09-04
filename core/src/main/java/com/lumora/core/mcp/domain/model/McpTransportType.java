package com.lumora.core.mcp.domain.model;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import java.util.Arrays;
import java.util.Locale;

public enum McpTransportType {
    STREAMABLE_HTTP("streamable_http"),
    STDIO("stdio");

    private final String value;

    McpTransportType(String value) {
        this.value = value;
    }

    @JsonValue
    public String value() {
        return value;
    }

    @JsonCreator
    public static McpTransportType fromValue(String value) {
        String normalized = value == null || value.isBlank()
                ? STREAMABLE_HTTP.value
                : value.trim().toLowerCase(Locale.ROOT);
        return Arrays.stream(values())
                .filter(type -> type.value.equals(normalized))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException(
                        "不支持的 MCP Transport: " + value
                ));
    }
}
