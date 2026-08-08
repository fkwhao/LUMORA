package com.lumora.core.common.constant;

/**
 * Java Core 对 Electron 暴露的 REST 与 SSE 路径。
 */
public final class ApiPathConstants {

    public static final String API_PREFIX = "/api/v1";
    public static final String API_SCOPE_PREFIX = API_PREFIX + "/";
    public static final String HEALTH = API_PREFIX + "/health";
    public static final String TASKS = API_PREFIX + "/tasks";
    public static final String MODEL_SETTINGS =
            API_PREFIX + "/model/settings";
    public static final String MEMORY = API_PREFIX + "/memory";
    public static final String MODEL_LIST = "/models";
    public static final String CHAT_COMPLETIONS =
            API_PREFIX + "/chat/completions";
    public static final String TASK_BY_ID = "/{taskId}";
    public static final String TASK_EVENTS = TASK_BY_ID + "/events";
    public static final String TASK_PREFERENCES = TASK_BY_ID + "/preferences";
    public static final String TASK_MESSAGES = TASK_BY_ID + "/messages";
    public static final String TASK_MESSAGE_STREAM =
            TASK_MESSAGES + "/stream";
    public static final String TASK_MESSAGE_CANCEL =
            TASK_MESSAGES + "/cancel";
    public static final String TASK_MESSAGE_REGENERATE =
            TASK_MESSAGES + "/{messageId}/regenerate";
    public static final String TASK_MESSAGE_BRANCH =
            TASK_MESSAGES + "/{messageId}/activate";
    public static final String TASK_CONTEXT_COMPACT =
            TASK_BY_ID + "/context/compact";
    public static final String TASK_ARTIFACT =
            TASK_BY_ID + "/artifacts/{artifactId}";
    public static final String TASK_APPROVALS =
            TASKS + TASK_BY_ID + "/approvals";
    public static final String APPROVAL_BY_ID = "/{approvalId}";
    public static final String TASK_TOOL_APPROVAL =
            TASK_BY_ID + "/tool-approvals/{approvalId}";

    private ApiPathConstants() {
    }
}
