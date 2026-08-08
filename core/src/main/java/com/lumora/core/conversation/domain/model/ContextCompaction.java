package com.lumora.core.conversation.domain.model;

public record ContextCompaction(
        String summary,
        int beforeTokens,
        int afterTokens,
        Integer throughSequence,
        Integer retainedFromSequence,
        TokenUsage usage
) {
}
