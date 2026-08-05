package com.lumora.core.model;

import java.util.Map;

public class ChatStreamEvent {

    private final ChatStreamEventType type;
    private final String delta;
    private final String model;
    private final TokenUsage usage;
    private final int activeContextTokens;
    private final String errorMessage;
    private final String itemId;
    private final String toolCallId;
    private final String toolName;
    private final String title;
    private final Map<String, Object> arguments;
    private final String output;
    private final long durationMs;
    private final Integer exitCode;
    private final Map<String, Object> metadata;
    private final String approvalId;
    private final String permissionLayer;
    private final String reason;
    private final String riskLevel;
    private final Boolean reversible;
    private final String decision;

    public ChatStreamEvent(
            ChatStreamEventType type,
            String delta,
            String model,
            TokenUsage usage,
            String errorMessage
    ) {
        this(
                type, delta, model, usage, errorMessage,
                "", "", "", "", Map.of(), "", 0L, null, Map.of(),
                "", "", "", "", null, ""
        );
    }

    public ChatStreamEvent(
            ChatStreamEventType type,
            String delta,
            String model,
            TokenUsage usage,
            String errorMessage,
            String itemId,
            String toolCallId,
            String toolName,
            String title,
            Map<String, Object> arguments,
            String output,
            long durationMs,
            Integer exitCode,
            Map<String, Object> metadata
    ) {
        this(
                type, delta, model, usage, errorMessage, itemId, toolCallId,
                toolName, title, arguments, output, durationMs, exitCode,
                metadata, "", "", "", "", null, ""
        );
    }

    public ChatStreamEvent(
            ChatStreamEventType type,
            String delta,
            String model,
            TokenUsage usage,
            String errorMessage,
            String itemId,
            String toolCallId,
            String toolName,
            String title,
            Map<String, Object> arguments,
            String output,
            long durationMs,
            Integer exitCode,
            Map<String, Object> metadata,
            String approvalId,
            String permissionLayer,
            String reason,
            String riskLevel,
            Boolean reversible,
            String decision
    ) {
        this(
                type, delta, model, usage, errorMessage, itemId, toolCallId,
                toolName, title, arguments, output, durationMs, exitCode,
                metadata, approvalId, permissionLayer, reason, riskLevel,
                reversible, decision, 0
        );
    }

    public ChatStreamEvent(
            ChatStreamEventType type,
            String delta,
            String model,
            TokenUsage usage,
            String errorMessage,
            String itemId,
            String toolCallId,
            String toolName,
            String title,
            Map<String, Object> arguments,
            String output,
            long durationMs,
            Integer exitCode,
            Map<String, Object> metadata,
            String approvalId,
            String permissionLayer,
            String reason,
            String riskLevel,
            Boolean reversible,
            String decision,
            int activeContextTokens
    ) {
        this.type = type;
        this.delta = delta;
        this.model = model;
        this.usage = usage;
        this.activeContextTokens = Math.max(0, activeContextTokens);
        this.errorMessage = errorMessage;
        this.itemId = itemId;
        this.toolCallId = toolCallId;
        this.toolName = toolName;
        this.title = title;
        this.arguments = arguments == null ? Map.of() : Map.copyOf(arguments);
        this.output = output;
        this.durationMs = durationMs;
        this.exitCode = exitCode;
        this.metadata = metadata == null ? Map.of() : Map.copyOf(metadata);
        this.approvalId = approvalId == null ? "" : approvalId;
        this.permissionLayer = permissionLayer == null ? "" : permissionLayer;
        this.reason = reason == null ? "" : reason;
        this.riskLevel = riskLevel == null ? "" : riskLevel;
        this.reversible = reversible;
        this.decision = decision == null ? "" : decision;
    }

    public ChatStreamEventType getType() {
        return type;
    }

    public String getDelta() {
        return delta;
    }

    public String getModel() {
        return model;
    }

    public TokenUsage getUsage() {
        return usage;
    }

    public int getActiveContextTokens() {
        return activeContextTokens;
    }

    public String getErrorMessage() {
        return errorMessage;
    }

    public String getItemId() { return itemId; }
    public String getToolCallId() { return toolCallId; }
    public String getToolName() { return toolName; }
    public String getTitle() { return title; }
    public Map<String, Object> getArguments() { return arguments; }
    public String getOutput() { return output; }
    public long getDurationMs() { return durationMs; }
    public Integer getExitCode() { return exitCode; }
    public Map<String, Object> getMetadata() { return metadata; }
    public String getApprovalId() { return approvalId; }
    public String getPermissionLayer() { return permissionLayer; }
    public String getReason() { return reason; }
    public String getRiskLevel() { return riskLevel; }
    public Boolean getReversible() { return reversible; }
    public String getDecision() { return decision; }
}
