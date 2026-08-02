package com.lumora.core.controller;

import com.lumora.core.common.constant.ApiPathConstants;
import com.lumora.core.common.constant.HttpContractConstants;
import com.lumora.core.dto.request.ChatCompletionRequest;
import com.lumora.core.dto.response.ChatCompletionResponse;
import com.lumora.core.model.ChatMessage;
import com.lumora.core.service.ModelService;
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

    private final ModelService modelService;

    @PostMapping
    public ChatCompletionResponse complete(
            @Valid @RequestBody ChatCompletionRequest request,
            @RequestHeader(HttpContractConstants.CORRELATION_ID_HEADER)
            String correlationId
    ) {
        return ChatCompletionResponse.fromModel(
                modelService.completeChat(
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
