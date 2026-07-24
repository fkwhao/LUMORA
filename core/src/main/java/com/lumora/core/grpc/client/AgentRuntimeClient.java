package com.lumora.core.grpc.client;

import java.util.List;

/**
 * Service 调用 Python Agent 的稳定接口，不向业务层暴露 Protobuf 类型。
 */
public interface AgentRuntimeClient {

    List<AgentPlanStep> planTask(
            String taskId,
            String goal,
            String correlationId
    );
}
