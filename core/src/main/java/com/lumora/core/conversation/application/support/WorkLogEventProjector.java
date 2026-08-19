package com.lumora.core.conversation.application.support;

import com.lumora.core.conversation.domain.model.ChatStreamEvent;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/** 将实时工具事件压缩为可安全持久化的工作记录投影。 */
public final class WorkLogEventProjector {

    private static final int MAX_PROGRESS_LENGTH = 4_000;
    private static final int MAX_ARGUMENT_LENGTH = 2_000;
    private static final int MAX_PATCH_PREVIEW_LENGTH = 12_000;
    private static final int MAX_OUTPUT_LENGTH = 8_000;
    private static final Set<String> OMITTED_ARGUMENTS = Set.of(
            "content"
    );
    private static final Set<String> METADATA_ALLOWLIST = Set.of(
            "path",
            "durationMs",
            "category",
            "readOnly",
            "destructive",
            "title",
            "exitCode",
            "lineCount",
            "totalLineCount",
            "startLine",
            "endLine",
            "hasMore",
            "truncated",
            "nextStartLine",
            "matchCount",
            "resultCount",
            "replacements",
            "previousLines",
            "currentLines",
            "created",
            "artifactId",
            "artifactUri",
            "artifactMimeType",
            "artifactByteSize",
            "artifactCharacterCount",
            "artifactEstimatedTokens",
            "artifactSha256",
            "artifactTruncated",
            "beforeTokens",
            "afterTokens",
            "throughSequence",
            "retainedFromSequence",
            "trigger",
            "permissionLayer",
            "permissionReason",
            "riskLevel",
            "reversible",
            "workspacePath",
            "approvalReviewer",
            "approvalReviewDecision",
            "approvalReviewReason",
            "approvalReviewRiskLevel",
            "approvalReviewerModel",
            "approvalReviewFallback",
            "failureKind",
            "toolExecutionState",
            "executionLocation",
            "callSignature",
            "sources",
            "agentId",
            "sessionId",
            "parentAgentId",
            "agentLabel",
            "agentRole",
            "agentStatus",
            "parentSessionId",
            "sessionMode",
            "activationId",
            "activationStatus",
            "inboxSequence",
            "senderAgentId",
            "messageStatus",
            "checkpointSequence",
            "consumedInboxSequence",
            "unreadReportCount",
            "reportFinal",
            "recovered",
            "interruptReason",
            "delegationDepth",
            "childEventType",
            "childSequence",
            "visibleEventCount",
            "promptTokens",
            "completionTokens",
            "totalTokens",
            "activeContextTokens",
            "usageCategory"
    );

    private WorkLogEventProjector() {
    }

    public static ChatStreamEvent project(ChatStreamEvent event) {
        return new ChatStreamEvent(
                event.getType(),
                truncate(event.getDelta(), MAX_PROGRESS_LENGTH),
                event.getModel(),
                null,
                truncate(event.getErrorMessage(), MAX_ARGUMENT_LENGTH),
                event.getItemId(),
                event.getToolCallId(),
                event.getToolName(),
                truncate(event.getTitle(), MAX_ARGUMENT_LENGTH),
                projectArguments(event.getToolName(), event.getArguments()),
                truncate(event.getOutput(), MAX_OUTPUT_LENGTH),
                event.getDurationMs(),
                event.getExitCode(),
                projectMetadata(event.getMetadata())
        );
    }

    private static Map<String, Object> projectArguments(
            String toolName,
            Map<String, Object> arguments
    ) {
        Map<String, Object> projected = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : arguments.entrySet()) {
            if (OMITTED_ARGUMENTS.contains(entry.getKey())) {
                projected.put(entry.getKey(), "[内容未持久化]");
            } else if ("apply_patch".equals(toolName)
                    && ("oldText".equals(entry.getKey())
                    || "newText".equals(entry.getKey()))) {
                projected.put(
                        entry.getKey(),
                        boundedPatchPreview(entry.getValue())
                );
            } else {
                projected.put(entry.getKey(), boundedValue(entry.getValue()));
            }
        }
        return projected;
    }

    private static Object boundedPatchPreview(Object value) {
        return value instanceof String
                ? truncate((String) value, MAX_PATCH_PREVIEW_LENGTH)
                : value;
    }

    private static Map<String, Object> projectMetadata(
            Map<String, Object> metadata
    ) {
        Map<String, Object> projected = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : metadata.entrySet()) {
            if (METADATA_ALLOWLIST.contains(entry.getKey())) {
                projected.put(entry.getKey(), boundedValue(entry.getValue()));
            }
        }
        return projected;
    }

    private static Object boundedValue(Object value) {
        return value instanceof String
                ? truncate((String) value, MAX_ARGUMENT_LENGTH)
                : value;
    }

    private static String truncate(String value, int maximum) {
        if (value == null || value.length() <= maximum) {
            return value;
        }
        return value.substring(0, maximum) + "…";
    }
}
