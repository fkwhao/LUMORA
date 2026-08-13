package com.lumora.core.agent.client;

import com.lumora.core.agent.model.AgentPlanStep;
import com.lumora.core.memory.domain.model.MemoryCandidate;
import com.lumora.core.agent.model.AgentChatStreamRequest;
import com.lumora.core.conversation.domain.model.ChatCompletion;
import com.lumora.core.conversation.domain.model.ChatMessage;
import com.lumora.core.conversation.domain.model.ChatStreamEvent;
import com.lumora.core.conversation.domain.model.ContextCompaction;
import com.lumora.core.model.domain.model.ModelConnection;
import com.lumora.core.mcp.domain.model.McpConnectionTest;
import com.lumora.core.mcp.domain.model.McpServerRuntimeConfiguration;

import java.util.List;
import java.util.function.Consumer;

/**
 * Service 调用 Python Agent 的稳定接口，业务层不依赖 HTTP DTO。
 */
public interface AgentRuntimeClient {

    default McpConnectionTest testMcpServer(
        McpServerRuntimeConfiguration configuration,
        String correlationId
    ) {
        throw new UnsupportedOperationException("当前 Agent Runtime 不支持 MCP");
    }

    void decideToolApproval(
        String approvalId,
        String decision,
        String correlationId
    );

    List<String> listModels(
        String providerName,
        String baseUrl,
        String apiKey,
        String correlationId
    );

    default List<String> listModels(
        String providerName,
        String baseUrl,
        String apiKey,
        String apiFormat,
        String correlationId
    ) {
        return listModels(providerName, baseUrl, apiKey, correlationId);
    }

    List<MemoryCandidate> extractMemories(
        String userMessage,
        String assistantMessage,
        String existingMemorySummary,
        ModelConnection connection,
        String correlationId
    );

    default List<MemoryCandidate> extractMemories(
        String userMessage,
        String assistantMessage,
        String existingMemorySummary,
        String workspacePath,
        ModelConnection connection,
        String correlationId
    ) {
        return extractMemories(userMessage, assistantMessage,
            existingMemorySummary, connection, correlationId);
    }

    /**
     * 请求 Python Agent 为任务生成初始计划。
     *
     * @param taskId        Java 侧预先生成的任务 ID
     * @param goal          用户任务目标
     * @param correlationId 全链路关联 ID
     * @return 按执行顺序排列的计划步骤
     */
    List<AgentPlanStep> planTask(
        String taskId,
        String goal,
        String correlationId
    );

    /**
     * 通过 Python Agent 执行一次非流式模型对话。
     *
     * @param messages      模型上下文
     * @param connection    仅在当前调用内使用的模型连接信息
     * @param correlationId 全链路关联 ID
     * @return 完整模型回答
     */
    ChatCompletion completeChat(
        List<ChatMessage> messages,
        ModelConnection connection,
        String correlationId
    );

    ContextCompaction compactChat(
        List<ChatMessage> messages,
        ModelConnection connection,
        String memorySummary,
        String taskId,
        String conversationSummary,
        String correlationId
    );

    void streamChat(AgentChatStreamRequest request,
                    Consumer<ChatStreamEvent> eventConsumer);
}
