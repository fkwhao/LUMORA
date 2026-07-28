package com.lumora.core.agent.constant;

import java.time.Duration;

/**
 * Java 调用 Python Agent 时使用的固定客户端参数。
 */
public final class AgentClientConstants {

    public static final String PLAN_TASK_PATH = "/api/v1/tasks/plan";
    public static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(30);

    private AgentClientConstants() {
    }
}
