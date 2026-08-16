package com.lumora.core.agent.client.http;

import com.lumora.core.agent.constant.AgentClientConstants;
import com.lumora.core.agent.dto.request.AgentChatCompletionRequest;
import com.lumora.core.agent.dto.request.AgentPlanTaskRequest;
import com.lumora.core.agent.dto.request.AgentModelListRequest;
import com.lumora.core.agent.dto.request.AgentMcpServerRequest;
import com.lumora.core.agent.dto.request.AgentMemoryExtractionRequest;
import com.lumora.core.agent.dto.request.AgentToolApprovalDecisionRequest;
import com.lumora.core.agent.dto.response.AgentChatCompletionResponse;
import com.lumora.core.agent.dto.response.AgentContextCompactionResponse;
import com.lumora.core.agent.dto.response.AgentPlanTaskResponse;
import com.lumora.core.agent.dto.response.AgentModelListResponse;
import com.lumora.core.agent.dto.response.AgentMemoryExtractionResponse;
import com.lumora.core.agent.dto.response.AgentMcpTestResponse;
import com.lumora.core.shared.api.constant.HttpContractConstants;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.service.annotation.HttpExchange;
import org.springframework.web.service.annotation.PostExchange;

import java.util.Map;

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

    @PostExchange(AgentClientConstants.MCP_TEST_PATH)
    AgentMcpTestResponse testMcpServer(
            @RequestHeader(HttpContractConstants.CORRELATION_ID_HEADER)
            String correlationId,
            @RequestBody AgentMcpServerRequest request
    );

    @PostExchange(AgentClientConstants.TOOL_APPROVAL_PATH)
    void decideToolApproval(
            @RequestHeader(HttpContractConstants.CORRELATION_ID_HEADER)
            String correlationId,
            @PathVariable String approvalId,
            @RequestBody AgentToolApprovalDecisionRequest request
    );

    @PostExchange(AgentClientConstants.MODELS_PATH)
    AgentModelListResponse listModels(
            @RequestHeader(HttpContractConstants.CORRELATION_ID_HEADER)
            String correlationId,
            @RequestBody AgentModelListRequest request
    );

    @PostExchange(AgentClientConstants.MEMORY_EXTRACTIONS_PATH)
    AgentMemoryExtractionResponse extractMemories(
            @RequestHeader(HttpContractConstants.CORRELATION_ID_HEADER)
            String correlationId,
            @RequestBody AgentMemoryExtractionRequest request
    );

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

    @PostExchange(AgentClientConstants.CHAT_COMPACTION_PATH)
    AgentContextCompactionResponse compactChat(
            @RequestHeader(HttpContractConstants.CORRELATION_ID_HEADER)
            String correlationId,
            @RequestBody AgentChatCompletionRequest request
    );

    @PostExchange(AgentClientConstants.CHAT_RUN_PAUSE_PATH)
    Map<String, Boolean> pauseRun(
            @RequestHeader(HttpContractConstants.CORRELATION_ID_HEADER)
            String correlationId,
            @PathVariable String runId
    );

}
