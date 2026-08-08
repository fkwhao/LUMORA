package com.lumora.core.conversation.api.dto.response;

import com.lumora.core.conversation.domain.model.TokenUsage;

public class TokenUsageResponse {

    private final int promptTokens;
    private final int completionTokens;
    private final int totalTokens;

    public TokenUsageResponse(
            int promptTokens,
            int completionTokens,
            int totalTokens
    ) {
        this.promptTokens = promptTokens;
        this.completionTokens = completionTokens;
        this.totalTokens = totalTokens;
    }

    public static TokenUsageResponse fromModel(TokenUsage usage) {
        return new TokenUsageResponse(
                usage.getPromptTokens(),
                usage.getCompletionTokens(),
                usage.getTotalTokens()
        );
    }

    public int getPromptTokens() {
        return promptTokens;
    }

    public int getCompletionTokens() {
        return completionTokens;
    }

    public int getTotalTokens() {
        return totalTokens;
    }
}
