package com.lumora.core.agent.client.http;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lumora.core.agent.constant.AgentClientConstants;
import com.lumora.core.agent.converter.AgentDtoMapper;
import com.lumora.core.agent.dto.request.AgentChatCompletionRequest;
import com.lumora.core.agent.dto.response.AgentChatStreamEventResponse;
import com.lumora.core.agent.exception.AgentRuntimeException;
import com.lumora.core.common.constant.HttpContractConstants;
import com.lumora.core.model.ChatStreamEvent;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.function.Consumer;

/**
 * 专门负责 Python SSE 连接和事件解码，避免流处理污染普通 REST Client。
 */
@Component
public class AgentRuntimeSseClient {

    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final AgentDtoMapper dtoMapper;
    private final AgentClientExceptionMapper exceptionMapper;

    public AgentRuntimeSseClient(
            @Qualifier("agentSseRestClient") RestClient restClient,
            ObjectMapper objectMapper,
            AgentDtoMapper dtoMapper,
            AgentClientExceptionMapper exceptionMapper
    ) {
        this.restClient = restClient;
        this.objectMapper = objectMapper;
        this.dtoMapper = dtoMapper;
        this.exceptionMapper = exceptionMapper;
    }

    public void streamChat(
            String correlationId,
            AgentChatCompletionRequest request,
            Consumer<ChatStreamEvent> eventConsumer
    ) {
        try {
            restClient.post()
                    .uri(AgentClientConstants.CHAT_COMPLETIONS_STREAM_PATH)
                    .header(
                            HttpContractConstants.CORRELATION_ID_HEADER,
                            correlationId
                    )
                    .body(request)
                    .exchange((httpRequest, response) -> {
                        if (!response.getStatusCode().is2xxSuccessful()) {
                            throw exceptionMapper.fromStatus(
                                    response.getStatusCode()
                            );
                        }
                        readEvents(response.getBody(), eventConsumer);
                        return null;
                    });
        } catch (AgentRuntimeException error) {
            throw error;
        } catch (RestClientException error) {
            throw exceptionMapper.map(error);
        }
    }

    private void readEvents(
            java.io.InputStream inputStream,
            Consumer<ChatStreamEvent> eventConsumer
    ) {
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(inputStream, StandardCharsets.UTF_8)
        )) {
            String line;
            while ((line = reader.readLine()) != null) {
                consumeLine(line, eventConsumer);
            }
        } catch (IOException error) {
            throw new AgentRuntimeException(
                    "读取 Python Agent 流式响应失败",
                    error
            );
        }
    }

    private void consumeLine(
            String line,
            Consumer<ChatStreamEvent> eventConsumer
    ) {
        if (!line.startsWith(AgentClientConstants.SSE_DATA_PREFIX)) {
            return;
        }
        String json = line.substring(
                AgentClientConstants.SSE_DATA_PREFIX.length()
        ).trim();
        if (json.isEmpty()) {
            return;
        }
        try {
            AgentChatStreamEventResponse response = objectMapper.readValue(
                    json,
                    AgentChatStreamEventResponse.class
            );
            eventConsumer.accept(dtoMapper.toChatStreamEvent(response));
        } catch (JsonProcessingException error) {
            throw new AgentRuntimeException(
                    "Python Agent 返回了无效流事件",
                    error
            );
        }
    }
}
