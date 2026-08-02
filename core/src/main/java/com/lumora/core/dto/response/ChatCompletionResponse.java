package com.lumora.core.dto.response;

import com.lumora.core.model.ChatCompletion;

public class ChatCompletionResponse {

    private final String message;
    private final String model;
    private final TokenUsageResponse usage;

    public ChatCompletionResponse(
            String message,
            String model,
            TokenUsageResponse usage
    ) {
        this.message = message;
        this.model = model;
        this.usage = usage;
    }

    public static ChatCompletionResponse fromModel(ChatCompletion completion) {
        return new ChatCompletionResponse(
                completion.getMessage(),
                completion.getModel(),
                TokenUsageResponse.fromModel(completion.getUsage())
        );
    }

    public String getMessage() {
        return message;
    }

    public String getModel() {
        return model;
    }

    public TokenUsageResponse getUsage() {
        return usage;
    }
}
