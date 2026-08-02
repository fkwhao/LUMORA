package com.lumora.core.service.support.conversation;

import com.lumora.core.model.ChatStreamEvent;
import com.lumora.core.model.ChatStreamEventType;
import com.lumora.core.model.TokenUsage;

/**
 * 累积一次模型流的最终文本、模型和用量。
 */
public class ConversationStreamAccumulator {

    private final StringBuilder content = new StringBuilder();
    private final StringBuilder reasoningContent = new StringBuilder();
    private String model = "";
    private TokenUsage usage;
    private boolean completed;

    public void accept(ChatStreamEvent event) {
        if (event.getType() == ChatStreamEventType.TEXT_DELTA) {
            content.append(valueOrEmpty(event.getDelta()));
        } else if (event.getType() == ChatStreamEventType.REASONING_DELTA) {
            reasoningContent.append(valueOrEmpty(event.getDelta()));
        } else if (event.getType() == ChatStreamEventType.FAILED) {
            throw new IllegalStateException(valueOrEmpty(
                    event.getErrorMessage()
            ));
        } else if (event.getType() == ChatStreamEventType.COMPLETED) {
            completed = true;
        }

        if (event.getModel() != null && !event.getModel().isBlank()) {
            model = event.getModel();
        }
        if (event.getUsage() != null) {
            usage = event.getUsage();
        }
    }

    public String getContent() {
        return content.toString();
    }

    public String getReasoningContent() {
        return reasoningContent.toString();
    }

    public String getModel() {
        return model;
    }

    public TokenUsage getUsage() {
        return usage;
    }

    public boolean isCompleted() {
        return completed;
    }

    private String valueOrEmpty(String value) {
        return value == null ? "" : value;
    }
}
