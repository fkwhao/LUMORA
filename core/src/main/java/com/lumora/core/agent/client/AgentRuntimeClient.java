package com.lumora.core.agent.client;

import com.lumora.core.agent.model.AgentPlanStep;

import java.util.List;

/**
 * Service 调用 Python Agent 的稳定接口，业务层不依赖 HTTP DTO。
 */
public interface AgentRuntimeClient {

    List<AgentPlanStep> planTask(
            String taskId,
            String goal,
            String correlationId
    );
}
