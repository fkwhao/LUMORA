package com.lumora.core.agent.client;

import com.lumora.core.conversation.domain.model.ChatMessage;
import com.lumora.core.model.application.port.ModelProviderGateway;
import com.lumora.core.model.domain.model.ModelConnection;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Adapts provider configuration use cases to the Python Agent client.
 */
@Component
@RequiredArgsConstructor
public class AgentModelProviderGateway implements ModelProviderGateway {

    private final AgentRuntimeClient agentRuntimeClient;

    @Override
    public List<String> listModels(String providerName, String baseUrl,
                                   String apiKey, String apiFormat, String correlationId) {
        return agentRuntimeClient.listModels(providerName, baseUrl, apiKey,
            apiFormat, correlationId);
    }

    @Override
    public void testConnection(ModelConnection connection,
                               String correlationId) {
        agentRuntimeClient.completeChat(
            List.of(new ChatMessage("user", "Reply with OK.")),
            connection,
            correlationId
        );
    }
}
