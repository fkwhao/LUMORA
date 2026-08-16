package com.lumora.core.conversation.application.port;

import com.lumora.core.conversation.application.model.ConversationRunRequest;
import com.lumora.core.conversation.domain.model.ChatCompletion;
import com.lumora.core.conversation.domain.model.ChatMessage;
import com.lumora.core.conversation.domain.model.ChatStreamEvent;

import java.util.List;
import java.util.function.Consumer;

/**
 * Runtime capabilities required by the conversation use cases.
 */
public interface ConversationRuntimePort {

    ChatCompletion completeChat(List<ChatMessage> messages,
            String correlationId);

    void streamChat(ConversationRunRequest request,
            Consumer<ChatStreamEvent> eventConsumer);

    boolean pauseChat(String runId, String correlationId);

    boolean addSteer(String runId, String inputId, String content,
                     String correlationId);

    boolean replaceSteer(String runId, String inputId, String content,
                         String correlationId);

    boolean removeSteer(String runId, String inputId, String correlationId);
}
