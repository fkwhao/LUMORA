package com.lumora.core.conversation.api.controller;

import com.lumora.core.shared.api.constant.ApiPathConstants;
import com.lumora.core.shared.api.constant.HttpContractConstants;
import com.lumora.core.conversation.api.dto.request.ChatCompletionRequest;
import com.lumora.core.conversation.api.dto.response.ChatCompletionResponse;
import com.lumora.core.conversation.domain.model.ChatMessage;
import com.lumora.core.conversation.application.port.ConversationRuntimePort;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping(ApiPathConstants.CHAT_COMPLETIONS)
public class ChatController {

    private final ConversationRuntimePort conversationRuntime;

    @PostMapping
    public ChatCompletionResponse complete(
            @Valid @RequestBody ChatCompletionRequest request,
            @RequestHeader(HttpContractConstants.CORRELATION_ID_HEADER)
            String correlationId
    ) {
        return ChatCompletionResponse.fromModel(
                conversationRuntime.completeChat(
                        request.getMessages().stream()
                                .map(message -> new ChatMessage(
                                        message.getRole(),
                                        message.getContent()
                                ))
                                .toList(),
                        correlationId
                )
        );
    }
}
