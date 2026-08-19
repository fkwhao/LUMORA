package com.lumora.core.conversation.application.support;

import com.lumora.core.conversation.domain.model.ChatStreamEvent;
import com.lumora.core.conversation.domain.model.ChatStreamEventType;
import com.lumora.core.conversation.domain.model.TokenUsage;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * 累积一次模型流的最终文本、模型和用量。
 */
public class ConversationStreamAccumulator {

    private static final int MAX_WORK_LOG_EVENTS = 400;

    private final StringBuilder content = new StringBuilder();
    private String model = "";
    private TokenUsage usage;
    private int activeContextTokens;
    private boolean completed;
    private boolean paused;
    private final List<ChatStreamEvent> workLogEvents = new ArrayList<>();
    private final List<Map<String, Object>> protocolMessages = new ArrayList<>();

    public void accept(ChatStreamEvent event) {
        boolean failed = event.getType() == ChatStreamEventType.FAILED;
        if (event.getType() == ChatStreamEventType.TEXT_DELTA) {
            content.append(valueOrEmpty(event.getDelta()));
        } else if (event.getType() == ChatStreamEventType.TEXT_RESET) {
            content.setLength(0);
            discardResetAssistantProtocol();
        } else if (event.getType() == ChatStreamEventType.COMPLETED) {
            completed = true;
        } else if (event.getType() == ChatStreamEventType.PAUSED) {
            paused = true;
        } else if (event.getType() == ChatStreamEventType.PROTOCOL_MESSAGE) {
            captureProtocolMessage(event);
        }

        if (event.getType() == ChatStreamEventType.PROGRESS_MESSAGE
                || event.getType() == ChatStreamEventType.AGENT_STARTED
                || event.getType() == ChatStreamEventType.AGENT_EVENT
                || event.getType() == ChatStreamEventType.AGENT_COMPLETED
                || event.getType() == ChatStreamEventType.AGENT_FAILED
                || event.getType() == ChatStreamEventType.AGENT_SESSION_CREATED
                || event.getType() == ChatStreamEventType.AGENT_INBOX_ENQUEUED
                || event.getType() == ChatStreamEventType.AGENT_ACTIVATION_STARTED
                || event.getType() == ChatStreamEventType.AGENT_ACTIVATION_INTERRUPTED
                || event.getType() == ChatStreamEventType.AGENT_REPORTED
                || event.getType() == ChatStreamEventType.AGENT_CHECKPOINTED
                || event.getType() == ChatStreamEventType.TOOL_STARTED
                || event.getType() == ChatStreamEventType.TOOL_COMPLETED
                || event.getType() == ChatStreamEventType.TOOL_FAILED
                || event.getType() == ChatStreamEventType.APPROVAL_REVIEW_STARTED
                || event.getType() == ChatStreamEventType.APPROVAL_REVIEW_COMPLETED
                || event.getType() == ChatStreamEventType.CONTEXT_COMPACTION_STARTED
                || event.getType() == ChatStreamEventType.CONTEXT_COMPACTION_PROGRESS
                || event.getType() == ChatStreamEventType.CONTEXT_COMPACTED
                || event.getType() == ChatStreamEventType.CONTEXT_COMPACTION_FAILED
                || event.getType() == ChatStreamEventType.WEB_SEARCH_STARTED
                || event.getType() == ChatStreamEventType.WEB_SEARCH_PROGRESS
                || event.getType() == ChatStreamEventType.WEB_SEARCH_COMPLETED
                || event.getType() == ChatStreamEventType.WEB_SEARCH_FAILED) {
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
        if (failed) {
            throw new IllegalStateException(valueOrEmpty(
                    event.getErrorMessage()
            ));
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

    public boolean isPaused() {
        return paused;
    }

    public boolean isTerminal() {
        return completed || paused;
    }

    public boolean hasBillableUsage() {
        return usage != null && (
                usage.getPromptTokens() > 0
                        || usage.getCompletionTokens() > 0
                        || usage.getTotalTokens() > 0
                        || usage.getInputTokens() > 0
                        || usage.getOutputTokens() > 0
                        || usage.getReasoningTokens() > 0
                        || usage.getCacheReadTokens() > 0
                        || usage.getCacheWriteTokens() > 0
        );
    }

    public boolean hasVisibleOutput() {
        return !content.toString().isBlank() || !workLogEvents.isEmpty();
    }

    public boolean hasPersistableResult() {
        return hasVisibleOutput() || hasBillableUsage();
    }

    public List<ChatStreamEvent> getWorkLogEvents() {
        return List.copyOf(workLogEvents);
    }

    public List<Map<String, Object>> getProtocolMessages() {
        return List.copyOf(protocolMessages);
    }

    private void captureProtocolMessage(ChatStreamEvent event) {
        Object rawMessage = event.getMetadata().get("message");
        if (!(rawMessage instanceof Map<?, ?> raw)) {
            return;
        }
        Map<String, Object> message = new java.util.LinkedHashMap<>();
        raw.forEach((key, value) -> {
            if (key instanceof String stringKey) {
                message.put(stringKey, value);
            }
        });
        if (!message.isEmpty()) {
            protocolMessages.add(Collections.unmodifiableMap(message));
        }
    }

    private void discardResetAssistantProtocol() {
        if (protocolMessages.isEmpty()) {
            return;
        }
        Map<String, Object> last = protocolMessages.getLast();
        Object rawToolCalls = last.get("toolCalls");
        boolean hasToolCalls = rawToolCalls instanceof List<?> toolCalls
                && !toolCalls.isEmpty();
        if ("assistant".equals(last.get("role"))
                && !hasToolCalls) {
            protocolMessages.removeLast();
        }
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
