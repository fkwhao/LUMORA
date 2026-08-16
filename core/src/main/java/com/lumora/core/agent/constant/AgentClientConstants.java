package com.lumora.core.agent.constant;

import java.time.Duration;

/**
 * Java 调用 Python Agent 时使用的固定客户端参数。
 */
public final class  AgentClientConstants {

    public static final String PLAN_TASK_PATH = "/api/v1/tasks/plan";
    public static final String CHAT_COMPLETIONS_PATH =
            "/api/v1/chat/completions";
    public static final String CHAT_COMPLETIONS_STREAM_PATH =
            "/api/v1/chat/completions/stream";
    public static final String CHAT_COMPACTION_PATH = "/api/v1/chat/compact";
    public static final String CHAT_RUN_PAUSE_PATH =
            "/api/v1/chat/runs/{runId}/pause";
    public static final String MODELS_PATH = "/api/v1/models";
    public static final String MEMORY_EXTRACTIONS_PATH =
            "/api/v1/memory/extractions";
    public static final String TOOL_APPROVAL_PATH =
            "/api/v1/tool-approvals/{approvalId}";
    public static final String MCP_TEST_PATH = "/api/v1/mcp/test";
    public static final String SSE_DATA_PREFIX = "data:";
    public static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(90);
    /** SSE 跟随任务生命周期，不设置固定读取截止时间。 */
    public static final Duration STREAM_READ_TIMEOUT = Duration.ZERO;

    private AgentClientConstants() {
    }
}
