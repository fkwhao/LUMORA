package com.lumora.core.shared.api.constant;

/**
 * Java Core 对 Electron 暴露的 REST 与 SSE 路径。
 */
public final class ApiPathConstants {

    public static final String API_PREFIX = "/api/v1";
    public static final String API_SCOPE_PREFIX = API_PREFIX + "/";
    public static final String WORKSPACE_INSPECT = "/workspaces/inspect";
    public static final String HEALTH = API_PREFIX + "/health";
    public static final String TASKS = API_PREFIX + "/tasks";
    public static final String MODEL_SETTINGS =
            API_PREFIX + "/model/settings";
    public static final String MEMORY = API_PREFIX + "/memory";
    public static final String MCP = API_PREFIX + "/mcp";
    public static final String USAGE_STATISTICS =
            API_PREFIX + "/usage/statistics";
    public static final String MODEL_LIST = "/models";
    public static final String CHAT_COMPLETIONS =
            API_PREFIX + "/chat/completions";
    public static final String TASK_BY_ID = "/{taskId}";
    public static final String TASK_EVENTS = TASK_BY_ID + "/events";
    public static final String TASK_PREFERENCES = TASK_BY_ID + "/preferences";
    public static final String TASK_WORKSPACE = TASK_BY_ID + "/workspace";
    public static final String TASK_WORKSPACE_HANDOFF =
            TASK_WORKSPACE + "/handoff";
    public static final String TASK_WORKTREE_SETTINGS =
            TASK_WORKSPACE + "/worktree-settings";
    public static final String TASK_WORKTREE = TASK_BY_ID + "/worktree";
    public static final String TASK_WORKTREE_CHANGES =
            TASK_WORKTREE + "/changes";
    public static final String TASK_WORKTREE_APPLY = TASK_WORKTREE + "/apply";
    public static final String TASK_WORKTREE_BRANCH = TASK_WORKTREE + "/branch";
    public static final String TASK_WORKTREE_DISCARD = TASK_WORKTREE + "/discard";
    public static final String TASK_GIT = TASK_BY_ID + "/git";
    public static final String TASK_GIT_BRANCHES = TASK_GIT + "/branches";
    public static final String TASK_GIT_CHECKOUT = TASK_GIT + "/checkout";
    public static final String TASK_GIT_HISTORY = TASK_GIT + "/history";
    public static final String TASK_GIT_CHANGES = TASK_GIT + "/changes";
    public static final String TASK_GIT_WORKTREES = TASK_GIT + "/worktrees";
    public static final String TASK_GIT_WORKTREES_PRUNE =
            TASK_GIT_WORKTREES + "/prune";
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
    public static final String TASK_RUNS = TASK_BY_ID + "/runs";
    public static final String TASK_ACTIVE_RUN = TASK_RUNS + "/active";
    public static final String TASK_RUN = TASK_RUNS + "/{runId}";
    public static final String TASK_RUN_EVENTS = TASK_RUN + "/events";
    public static final String TASK_RUN_CHANGES = TASK_RUN + "/changes";
    public static final String TASK_RUN_REVERT = TASK_RUN + "/revert";
    public static final String TASK_RUN_PAUSE = TASK_RUN + "/pause";
    public static final String TASK_RUN_RESUME = TASK_RUN + "/resume";
    public static final String TASK_RUN_CANCEL = TASK_RUN + "/cancel";
    public static final String TASK_ACTIVE_RUN_PAUSE =
            TASK_ACTIVE_RUN + "/pause";
    public static final String TASK_INPUTS = TASK_BY_ID + "/inputs";
    public static final String TASK_INPUT = TASK_INPUTS + "/{inputId}";

    private ApiPathConstants() {
    }
}
