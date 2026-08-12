package com.lumora.core.mcp.domain.model;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import java.util.Arrays;
import java.util.Locale;

public enum McpAuthenticationType {
    NONE("none"),
    BEARER("bearer"),
    API_KEY("api_key"),
    CUSTOM_HEADER("custom_header");

    private final String value;

    McpAuthenticationType(String value) {
        this.value = value;
    }

    @JsonValue
    public String value() {
        return value;
    }

    @JsonCreator
    public static McpAuthenticationType fromValue(String value) {
        String normalized = value == null || value.isBlank()
                ? NONE.value
                : value.trim().toLowerCase(Locale.ROOT);
        return Arrays.stream(values())
                .filter(type -> type.value.equals(normalized))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException(
                        "不支持的 MCP 静态认证类型: " + value
                ));
    }
}
