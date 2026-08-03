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
    public static final String MODELS_PATH = "/api/v1/models";
    public static final String MEMORY_EXTRACTIONS_PATH =
            "/api/v1/memory/extractions";
    public static final String SSE_DATA_PREFIX = "data:";
    public static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(90);

    private AgentClientConstants() {
    }
}
