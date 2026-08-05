package com.lumora.core.model;

public record ContextCompaction(
        String summary,
        int beforeTokens,
        int afterTokens,
        Integer throughSequence,
        Integer retainedFromSequence,
        TokenUsage usage
) {
}
