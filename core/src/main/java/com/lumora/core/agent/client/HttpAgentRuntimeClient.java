package com.lumora.core.agent.client;

import com.lumora.core.agent.client.http.AgentClientExceptionMapper;
import com.lumora.core.agent.client.http.AgentRuntimeHttpApi;
import com.lumora.core.agent.client.http.AgentRuntimeSseClient;
import com.lumora.core.agent.converter.AgentDtoMapper;
import com.lumora.core.agent.dto.request.AgentChatCompletionRequest;
import com.lumora.core.agent.dto.request.AgentPlanTaskRequest;
import com.lumora.core.agent.dto.response.AgentChatCompletionResponse;
import com.lumora.core.agent.dto.response.AgentPlanTaskResponse;
import com.lumora.core.agent.model.AgentPlanStep;
import com.lumora.core.model.ChatCompletion;
import com.lumora.core.model.ChatMessage;
import com.lumora.core.model.ChatStreamEvent;
import com.lumora.core.model.ModelConnection;
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
                connection
        );
        AgentChatCompletionResponse response = exceptionMapper.execute(
                () -> httpApi.completeChat(correlationId, request)
        );
        return dtoMapper.toChatCompletion(response);
    }

    @Override
    public void streamChat(
            List<ChatMessage> messages,
            ModelConnection connection,
            String correlationId,
            Consumer<ChatStreamEvent> eventConsumer
    ) {
        sseClient.streamChat(
                correlationId,
                dtoMapper.toChatRequest(messages, connection),
                eventConsumer
        );
    }
}
