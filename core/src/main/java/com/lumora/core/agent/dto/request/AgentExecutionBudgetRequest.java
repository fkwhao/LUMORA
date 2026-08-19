package com.lumora.core.agent.dto.request;

/**
 * 单次 Agent Run 的共享执行预算。
 *
 * <p>预算由根 Run 与全部子 Agent 共享，避免递归委派绕过模型请求、工具调用、
 * Token、时长和活动 Agent 上限。</p>
 */
public class AgentExecutionBudgetRequest {

    private final long maxTotalTokens;
    private final int maxModelRequests;
    private final int maxToolCalls;
    private final long maxWallTimeMs;
    private final int maxActiveAgents;

    public AgentExecutionBudgetRequest(
            long maxTotalTokens,
            int maxModelRequests,
            int maxToolCalls,
            long maxWallTimeMs,
            int maxActiveAgents
    ) {
        if (maxTotalTokens < 1 || maxTotalTokens > 100_000_000
                || maxModelRequests < 1 || maxModelRequests > 100_000
                || maxToolCalls < 1 || maxToolCalls > 1_000_000
                || maxWallTimeMs < 1_000 || maxWallTimeMs > 604_800_000
                || maxActiveAgents < 1 || maxActiveAgents > 100) {
            throw new IllegalArgumentException("Agent 执行预算超出允许范围");
        }
        this.maxTotalTokens = maxTotalTokens;
        this.maxModelRequests = maxModelRequests;
        this.maxToolCalls = maxToolCalls;
        this.maxWallTimeMs = maxWallTimeMs;
        this.maxActiveAgents = maxActiveAgents;
    }

    public static AgentExecutionBudgetRequest defaults() {
        return new AgentExecutionBudgetRequest(
                1_000_000,
                256,
                1_024,
                7_200_000,
                10
        );
    }

    public long getMaxTotalTokens() {
        return maxTotalTokens;
    }

    public int getMaxModelRequests() {
        return maxModelRequests;
    }

    public int getMaxToolCalls() {
        return maxToolCalls;
    }

    public long getMaxWallTimeMs() {
        return maxWallTimeMs;
    }

    public int getMaxActiveAgents() {
        return maxActiveAgents;
    }
}
