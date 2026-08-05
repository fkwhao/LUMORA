package com.lumora.core.dto.response;

import com.lumora.core.model.ContextCompaction;

public record ContextCompactionResponse(
        int beforeTokens,
        int afterTokens,
        Integer throughSequence,
        Integer retainedFromSequence,
        TokenUsageResponse usage
) {
    public static ContextCompactionResponse from(ContextCompaction value) {
        return new ContextCompactionResponse(
                value.beforeTokens(), value.afterTokens(),
                value.throughSequence(), value.retainedFromSequence(),
                new TokenUsageResponse(
                        value.usage().getPromptTokens(),
                        value.usage().getCompletionTokens(),
                        value.usage().getTotalTokens()
                )
        );
    }
}
