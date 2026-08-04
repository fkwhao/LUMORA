package com.lumora.core.model;

import java.util.Map;

public class ChatStreamEvent {

    private final ChatStreamEventType type;
    private final String delta;
    private final String model;
    private final TokenUsage usage;
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

    public ChatStreamEvent(
            ChatStreamEventType type,
            String delta,
            String model,
            TokenUsage usage,
            String errorMessage
    ) {
        this(
                type, delta, model, usage, errorMessage,
                "", "", "", "", Map.of(), "", 0L, null, Map.of()
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
        this.type = type;
        this.delta = delta;
        this.model = model;
        this.usage = usage;
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
}
