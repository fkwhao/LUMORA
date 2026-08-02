package com.lumora.core.model;

public class ChatStreamEvent {

    private final ChatStreamEventType type;
    private final String delta;
    private final String model;
    private final TokenUsage usage;
    private final String errorMessage;

    public ChatStreamEvent(
            ChatStreamEventType type,
            String delta,
            String model,
            TokenUsage usage,
            String errorMessage
    ) {
        this.type = type;
        this.delta = delta;
        this.model = model;
        this.usage = usage;
        this.errorMessage = errorMessage;
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
}
