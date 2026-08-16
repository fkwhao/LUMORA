package com.lumora.core.agent.client;

import com.lumora.core.agent.client.http.AgentClientExceptionMapper;
import com.lumora.core.agent.client.http.AgentRuntimeHttpApi;
import com.lumora.core.agent.client.http.AgentRuntimeSseClient;
import com.lumora.core.agent.converter.AgentDtoMapper;
import com.lumora.core.agent.dto.request.AgentChatCompletionRequest;
import com.lumora.core.agent.dto.request.AgentPlanTaskRequest;
import com.lumora.core.agent.dto.request.AgentMemoryExtractionRequest;
import com.lumora.core.agent.dto.request.AgentModelConnectionRequest;
import com.lumora.core.agent.dto.request.AgentModelListRequest;
import com.lumora.core.agent.dto.request.AgentMcpServerRequest;
import com.lumora.core.agent.dto.request.AgentToolApprovalDecisionRequest;
import com.lumora.core.agent.dto.request.AgentSteerRequest;
import com.lumora.core.agent.dto.response.AgentChatCompletionResponse;
import com.lumora.core.agent.dto.response.AgentPlanTaskResponse;
import com.lumora.core.agent.dto.response.AgentModelListResponse;
import com.lumora.core.agent.model.AgentPlanStep;
import com.lumora.core.memory.application.model.MemoryExtractionBatch;
import com.lumora.core.agent.model.AgentChatStreamRequest;
import com.lumora.core.conversation.domain.model.ChatCompletion;
import com.lumora.core.conversation.domain.model.ChatMessage;
import com.lumora.core.conversation.domain.model.ChatStreamEvent;
import com.lumora.core.conversation.domain.model.ContextCompaction;
import com.lumora.core.model.domain.model.ModelConnection;
import com.lumora.core.mcp.domain.model.McpConnectionTest;
import com.lumora.core.mcp.domain.model.McpServerRuntimeConfiguration;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.function.Consumer;

/**
 * Java 业务层访问 Python Agent Runtime 的适配器。
 *
 * <p>普通 REST 由 Spring HTTP Interface 声明，SSE 由独立流客户端处理；
 * 本类只负责编排调用与领域模型转换。</p>
 */
@Component
@RequiredArgsConstructor
public class HttpAgentRuntimeClient implements AgentRuntimeClient {

    private final AgentRuntimeHttpApi httpApi;
    private final AgentRuntimeSseClient sseClient;
    private final AgentDtoMapper dtoMapper;
    private final AgentClientExceptionMapper exceptionMapper;

    @Override
    public McpConnectionTest testMcpServer(
        McpServerRuntimeConfiguration configuration,
        String correlationId
    ) {
        var response = exceptionMapper.execute(
            () -> httpApi.testMcpServer(
                correlationId,
                new AgentMcpServerRequest(configuration)
            )
        );
        return new McpConnectionTest(
            response.isConnected(),
            response.getServerName(),
            response.getServerVersion(),
            response.getTools(),
            response.getResources(),
            response.getResourceTemplates(),
            response.getPrompts(),
            response.getEchoOutput()
        );
    }

    @Override
    public void decideToolApproval(
        String approvalId,
        String decision,
        String correlationId
    ) {
        exceptionMapper.executeVoid(() -> httpApi.decideToolApproval(
            correlationId,
            approvalId,
            new AgentToolApprovalDecisionRequest(decision)
        ));
    }

    @Override
    public MemoryExtractionBatch extractMemories(
        String userMessage,
        String assistantMessage,
        String existingMemorySummary,
        ModelConnection connection,
        String correlationId
    ) {
        return dtoMapper.toMemoryExtraction(exceptionMapper.execute(
            () -> httpApi.extractMemories(
                correlationId,
                new AgentMemoryExtractionRequest(
                    userMessage,
                    assistantMessage,
                    existingMemorySummary,
                    new AgentModelConnectionRequest(connection)
                )
            )
        ));
    }

    @Override
    public MemoryExtractionBatch extractMemories(
        String userMessage,
        String assistantMessage,
        String existingMemorySummary,
        String workspacePath,
        ModelConnection connection,
        String correlationId
    ) {
        return dtoMapper.toMemoryExtraction(exceptionMapper.execute(
            () -> httpApi.extractMemories(
                correlationId,
                new AgentMemoryExtractionRequest(
                    userMessage,
                    assistantMessage,
                    existingMemorySummary,
                    workspacePath,
                    new AgentModelConnectionRequest(connection)
                )
            )
        ));
    }

    @Override
    public List<String> listModels(
        String providerName,
        String baseUrl,
        String apiKey,
        String correlationId
    ) {
        return listModels(providerName, baseUrl, apiKey,
            "chat-completions", correlationId);
    }

    @Override
    public List<String> listModels(
        String providerName,
        String baseUrl,
        String apiKey,
        String apiFormat,
        String correlationId
    ) {
        AgentModelListResponse response = exceptionMapper.execute(
            () -> httpApi.listModels(
                correlationId,
                new AgentModelListRequest(
                    providerName,
                    baseUrl,
                    apiKey,
                    apiFormat
                )
            )
        );
        return response.getModels();
    }

    @Override
    public List<AgentPlanStep> planTask(
        String taskId,
        String goal,
        String correlationId
    ) {
        AgentPlanTaskResponse response = exceptionMapper.execute(
            () -> httpApi.planTask(
                correlationId,
                new AgentPlanTaskRequest(taskId, goal)
            )
        );
        return dtoMapper.toPlanSteps(response);
    }

    @Override
    public ChatCompletion completeChat(
        List<ChatMessage> messages,
        ModelConnection connection,
        String correlationId
    ) {
        AgentChatCompletionRequest request = dtoMapper.toChatRequest(
            messages,
            connection,
            null
        );
        AgentChatCompletionResponse response = exceptionMapper.execute(
            () -> httpApi.completeChat(correlationId, request)
        );
        return dtoMapper.toChatCompletion(response);
    }

    @Override
    public ContextCompaction compactChat(
        List<ChatMessage> messages,
        ModelConnection connection,
        String memorySummary,
        String taskId,
        String conversationSummary,
        String correlationId
    ) {
        return dtoMapper.toContextCompaction(exceptionMapper.execute(
            () -> httpApi.compactChat(
                correlationId,
                dtoMapper.toChatRequest(
                    messages, connection, null, memorySummary,
                    null, "request_approval", taskId,
                    conversationSummary
                )
            )
        ));
    }

    @Override
    public void streamChat(
        AgentChatStreamRequest request,
        Consumer<ChatStreamEvent> eventConsumer
    ) {
        sseClient.streamChat(
            request.correlationId(),
            dtoMapper.toChatRequest(
                request.messages(), request.connection(),
                request.reasoningEffort(), request.memorySummary(),
                request.workspacePath(), request.permissionMode(),
                request.taskId(), request.conversationSummary(),
                request.memoryCandidates(), request.mcpServers()
            ),
            eventConsumer
        );
    }

    @Override
    public boolean pauseRun(String runId, String correlationId) {
        return Boolean.TRUE.equals(exceptionMapper.execute(
                () -> httpApi.pauseRun(correlationId, runId)
        ).get("paused"));
    }

    @Override
    public boolean addSteer(
            String runId, String inputId, String content, String correlationId
    ) {
        return Boolean.TRUE.equals(exceptionMapper.execute(
                () -> httpApi.addSteer(
                        correlationId, runId, inputId,
                        new AgentSteerRequest(content)
                )
        ).get("accepted"));
    }

    @Override
    public boolean replaceSteer(
            String runId, String inputId, String content, String correlationId
    ) {
        return Boolean.TRUE.equals(exceptionMapper.execute(
                () -> httpApi.replaceSteer(
                        correlationId, runId, inputId,
                        new AgentSteerRequest(content)
                )
        ).get("replaced"));
    }

    @Override
    public boolean removeSteer(
            String runId, String inputId, String correlationId
    ) {
        return Boolean.TRUE.equals(exceptionMapper.execute(
                () -> httpApi.removeSteer(correlationId, runId, inputId)
        ).get("removed"));
    }

}
