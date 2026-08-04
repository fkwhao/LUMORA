package com.lumora.core.agent.dto.response;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.lumora.core.model.ChatStreamEventType;

import java.util.Map;

public class AgentChatStreamEventResponse {

    private final ChatStreamEventType type;
    private final String delta;
    private final String model;
    private final AgentTokenUsageResponse usage;
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

    @JsonCreator
    public AgentChatStreamEventResponse(
            @JsonProperty("type") ChatStreamEventType type,
            @JsonProperty("delta") String delta,
            @JsonProperty("model") String model,
            @JsonProperty("usage") AgentTokenUsageResponse usage,
            @JsonProperty("errorMessage") String errorMessage,
            @JsonProperty("itemId") String itemId,
            @JsonProperty("toolCallId") String toolCallId,
            @JsonProperty("toolName") String toolName,
            @JsonProperty("title") String title,
            @JsonProperty("arguments") Map<String, Object> arguments,
            @JsonProperty("output") String output,
            @JsonProperty("durationMs") long durationMs,
            @JsonProperty("exitCode") Integer exitCode,
            @JsonProperty("metadata") Map<String, Object> metadata
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

    public AgentTokenUsageResponse getUsage() {
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
