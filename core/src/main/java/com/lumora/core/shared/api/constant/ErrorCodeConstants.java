package com.lumora.core.shared.api.constant;

/**
 * Electron 可稳定识别的 Java REST 错误码。
 */
public final class ErrorCodeConstants {

    public static final String INVALID_REQUEST = "INVALID_REQUEST";
    public static final String TASK_NOT_FOUND = "TASK_NOT_FOUND";
    public static final String TASK_CONFLICT = "TASK_CONFLICT";
    public static final String AGENT_UNAVAILABLE = "AGENT_UNAVAILABLE";
    public static final String SECRET_PROTECTION_UNAVAILABLE =
            "SECRET_PROTECTION_UNAVAILABLE";

    private ErrorCodeConstants() {
    }
}
