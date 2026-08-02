package com.lumora.core.model;

public class ChatCompletion {

    private final String message;
    private final String model;
    private final TokenUsage usage;

    public ChatCompletion(String message, String model, TokenUsage usage) {
        this.message = message;
        this.model = model;
        this.usage = usage;
    }

    public String getMessage() {
        return message;
    }

    public String getModel() {
        return model;
    }

    public TokenUsage getUsage() {
        return usage;
    }
}
