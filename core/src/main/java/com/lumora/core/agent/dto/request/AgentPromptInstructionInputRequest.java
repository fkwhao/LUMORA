package com.lumora.core.agent.dto.request;

import java.util.Objects;
import java.util.regex.Pattern;

/**
 * 发送给 Python Agent Runtime 的结构化项目规则元数据。
 *
 * <p>来源由外层项目规则字段隐式确定。Core 侧可以提供来源引用、冲突键和作用域，
 * 但不能提供或提升 Python 侧的 authority、binding 等级。</p>
 */
public class AgentPromptInstructionInputRequest {
    private static final Pattern CONFLICT_KEY = Pattern.compile(
            "[A-Za-z0-9._:-]+"
    );

    private final String content;
    private final String sourceRef;
    private final String conflictKey;
    private final String scope;

    public AgentPromptInstructionInputRequest(
            String content,
            String sourceRef,
            String conflictKey,
            String scope
    ) {
        this.content = requireContent(content);
        this.sourceRef = normalizeOptional(sourceRef);
        this.conflictKey = normalizeConflictKey(conflictKey);
        this.scope = normalizeScope(scope);
        if (this.conflictKey != null && this.sourceRef == null) {
            throw new IllegalArgumentException(
                    "sourceRef is required when conflictKey is present"
            );
        }
    }

    public String getContent() { return content; }
    public String getSourceRef() { return sourceRef; }
    public String getConflictKey() { return conflictKey; }
    public String getScope() { return scope; }

    private static String requireContent(String value) {
        String normalized = Objects.requireNonNull(value, "content").trim();
        if (normalized.isEmpty()) {
            throw new IllegalArgumentException("Prompt instruction content cannot be blank");
        }
        return normalized;
    }

    private static String normalizeOptional(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private static String normalizeConflictKey(String value) {
        String normalized = normalizeOptional(value);
        if (normalized != null && !CONFLICT_KEY.matcher(normalized).matches()) {
            throw new IllegalArgumentException("Invalid prompt conflict key");
        }
        return normalized;
    }

    private static String normalizeScope(String value) {
        String normalized = value == null || value.isBlank()
                ? "workspace" : value.trim();
        if (!"workspace".equals(normalized)) {
            throw new IllegalArgumentException(
                    "Only workspace prompt scope is supported"
            );
        }
        return normalized;
    }
}
