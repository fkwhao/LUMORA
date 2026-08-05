package com.lumora.core.service.support.conversation;

import com.lumora.core.model.ChatStreamEvent;
import com.lumora.core.model.ChatStreamEventType;
import com.lumora.core.model.TokenUsage;

import java.util.ArrayList;
import java.util.List;

/**
 * 累积一次模型流的最终文本、模型和用量。
 */
public class ConversationStreamAccumulator {

    private static final int MAX_WORK_LOG_EVENTS = 200;

    private final StringBuilder content = new StringBuilder();
    private String model = "";
    private TokenUsage usage;
    private int activeContextTokens;
    private boolean completed;
    private final List<ChatStreamEvent> workLogEvents = new ArrayList<>();

    public void accept(ChatStreamEvent event) {
        if (event.getType() == ChatStreamEventType.TEXT_DELTA) {
            content.append(valueOrEmpty(event.getDelta()));
        } else if (event.getType() == ChatStreamEventType.FAILED) {
            throw new IllegalStateException(valueOrEmpty(
                    event.getErrorMessage()
            ));
        } else if (event.getType() == ChatStreamEventType.COMPLETED) {
            completed = true;
        }

        if (event.getType() == ChatStreamEventType.PROGRESS_MESSAGE
                || event.getType() == ChatStreamEventType.TOOL_STARTED
                || event.getType() == ChatStreamEventType.TOOL_COMPLETED
                || event.getType() == ChatStreamEventType.TOOL_FAILED
                || event.getType() == ChatStreamEventType.CONTEXT_COMPACTION_STARTED
                || event.getType() == ChatStreamEventType.CONTEXT_COMPACTION_PROGRESS
                || event.getType() == ChatStreamEventType.CONTEXT_COMPACTED
                || event.getType() == ChatStreamEventType.CONTEXT_COMPACTION_FAILED) {
            mergeWorkLogEvent(event);
        }

        if (event.getModel() != null && !event.getModel().isBlank()) {
            model = event.getModel();
        }
        if (event.getUsage() != null) {
            usage = event.getUsage();
        }
        if (event.getActiveContextTokens() > 0) {
            activeContextTokens = event.getActiveContextTokens();
        }
    }

    public String getContent() {
        return content.toString();
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

    public boolean isCompleted() {
        return completed;
    }

    public List<ChatStreamEvent> getWorkLogEvents() {
        return List.copyOf(workLogEvents);
    }

    private void mergeWorkLogEvent(ChatStreamEvent event) {
        ChatStreamEvent projected = WorkLogEventProjector.project(event);
        if (event.getItemId() != null && !event.getItemId().isBlank()) {
            for (int index = 0; index < workLogEvents.size(); index++) {
                if (event.getItemId().equals(
                        workLogEvents.get(index).getItemId()
                )) {
                    workLogEvents.set(index, projected);
                    return;
                }
            }
        }
        if (workLogEvents.size() < MAX_WORK_LOG_EVENTS) {
            workLogEvents.add(projected);
        }
    }

    private String valueOrEmpty(String value) {
        return value == null ? "" : value;
    }
}
