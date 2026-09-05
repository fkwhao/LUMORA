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
    private boolean activeContextEstimated = true;
    private boolean awaitingModelUsage;
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
                || event.getType() == ChatStreamEventType.AGENT_PEER_MESSAGE_QUEUED
                || event.getType() == ChatStreamEventType.AGENT_PEER_MESSAGE_DELIVERED
                || event.getType() == ChatStreamEventType.AGENT_PEER_MESSAGE_CONSUMED
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
        captureContextUsage(event);
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

    public boolean isActiveContextEstimated() {
        return activeContextEstimated;
    }

    /** Keep the same settled-sample boundary as the desktop context indicator. */
    private void captureContextUsage(ChatStreamEvent event) {
        if (event.getType() == ChatStreamEventType.PROTOCOL_MESSAGE) {
            Object message = event.getMetadata().get("message");
            if (message instanceof Map<?, ?> fields && fields.containsKey("role")) {
                awaitingModelUsage = "assistant".equals(fields.get("role"));
            }
            return;
        }
        boolean compacted = event.getType() == ChatStreamEventType.CONTEXT_COMPACTED;
        if (!compacted && (event.getType() != ChatStreamEventType.USAGE
                || Boolean.TRUE.equals(event.getMetadata().get("usageProvisional")))) {
            return;
        }
        if (event.getMetadata().containsKey("contextUsage")) {
            Object raw = event.getMetadata().get("contextUsage");
            if (raw instanceof Map<?, ?> snapshot) {
                int tokens = contextTokenNumber(snapshot.get("tokens"));
                if (tokens > 0) {
                    activeContextTokens = tokens;
                    activeContextEstimated = !Boolean.FALSE.equals(snapshot.get("estimated"));
                }
            }
            awaitingModelUsage = false;
            return;
        }
        // Older Agent events have no explicit sample. Tool projections and
        // supplemental billing snapshots must not overwrite model samples.
        if (!compacted && !awaitingModelUsage) return;
        int tokens = event.getActiveContextTokens();
        if (compacted && tokens <= 0) {
            tokens = contextTokenNumber(event.getMetadata().get("afterTokens"));
        }
        if (tokens > 0) {
            activeContextTokens = tokens;
            activeContextEstimated = true;
        }
        awaitingModelUsage = false;
    }

    private static int contextTokenNumber(Object value) {
        if (!(value instanceof Number number)) return 0;
        double tokens = number.doubleValue();
        return Double.isFinite(tokens) && tokens > 0
                && tokens <= Integer.MAX_VALUE && tokens == Math.floor(tokens)
                ? (int) tokens : 0;
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
