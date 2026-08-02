package com.lumora.core.agent.client.http;

import com.lumora.core.agent.constant.AgentClientConstants;
import com.lumora.core.agent.dto.request.AgentChatCompletionRequest;
import com.lumora.core.agent.dto.request.AgentPlanTaskRequest;
import com.lumora.core.agent.dto.response.AgentChatCompletionResponse;
import com.lumora.core.agent.dto.response.AgentPlanTaskResponse;
import com.lumora.core.common.constant.HttpContractConstants;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.service.annotation.HttpExchange;
import org.springframework.web.service.annotation.PostExchange;

/**
 * Python Agent Runtime 的声明式 REST 契约。
 *
 * <p>作用与 Feign Client 类似：这里只声明路径、Header 和 DTO，
 * 具体 HTTP 调用由 Spring 生成代理。</p>
 */
@HttpExchange(
        accept = MediaType.APPLICATION_JSON_VALUE,
        contentType = MediaType.APPLICATION_JSON_VALUE
)
public interface AgentRuntimeHttpApi {

    /**
     * 调用 Agent 任务规划端点。
     *
     * @param correlationId 全链路关联 ID
     * @param request 任务规划请求
     * @return Python 返回的计划
     */
    @PostExchange(AgentClientConstants.PLAN_TASK_PATH)
    AgentPlanTaskResponse planTask(
            @RequestHeader(HttpContractConstants.CORRELATION_ID_HEADER)
            String correlationId,
            @RequestBody AgentPlanTaskRequest request
    );

    /**
     * 调用 Agent 非流式对话端点。
     *
     * @param correlationId 全链路关联 ID
     * @param request 对话和临时模型连接信息
     * @return Python 标准化后的完整回答
     */
    @PostExchange(AgentClientConstants.CHAT_COMPLETIONS_PATH)
    AgentChatCompletionResponse completeChat(
            @RequestHeader(HttpContractConstants.CORRELATION_ID_HEADER)
            String correlationId,
            @RequestBody AgentChatCompletionRequest request
    );
}
