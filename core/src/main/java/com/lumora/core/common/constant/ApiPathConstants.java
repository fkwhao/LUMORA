package com.lumora.core.common.constant;

/**
 * Java Core 对 Electron 暴露的 REST 与 SSE 路径。
 */
public final class ApiPathConstants {

    public static final String API_PREFIX = "/api/v1";
    public static final String API_SCOPE_PREFIX = API_PREFIX + "/";
    public static final String HEALTH = API_PREFIX + "/health";
    public static final String TASKS = API_PREFIX + "/tasks";
    public static final String TASK_BY_ID = "/{taskId}";
    public static final String TASK_EVENTS = TASK_BY_ID + "/events";
    public static final String TASK_APPROVALS =
            TASKS + TASK_BY_ID + "/approvals";
    public static final String APPROVAL_BY_ID = "/{approvalId}";

    private ApiPathConstants() {
    }
}
