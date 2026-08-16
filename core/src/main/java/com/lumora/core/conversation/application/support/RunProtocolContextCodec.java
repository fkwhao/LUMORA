package com.lumora.core.conversation.application.support;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lumora.core.conversation.domain.model.ChatMessage;
import com.lumora.core.conversation.domain.model.ChatStreamEvent;
import com.lumora.core.conversation.domain.model.ChatStreamEventType;
import com.lumora.core.conversation.domain.model.ChatToolCall;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Stores the exact provider-visible assistant/tool trajectory separately from
 * the projected UI work log. This keeps resumed turns protocol-balanced and
 * avoids reconstructing tool state from prose.
 */
final class RunProtocolContextCodec {

    static final String MARKER_ITEM_ID = "lumora-model-protocol";
    private static final String MESSAGES_KEY = "protocolMessages";

    private RunProtocolContextCodec() {
    }

    static ChatStreamEvent marker(
            String model,
            List<Map<String, Object>> messages
    ) {
        return marker(model, messages, MARKER_ITEM_ID);
    }

    static ChatStreamEvent marker(
            String model,
            List<Map<String, Object>> messages,
            String markerItemId
    ) {
        return new ChatStreamEvent(
                ChatStreamEventType.PROGRESS_MESSAGE,
                "",
                model,
                null,
                "",
                markerItemId,
                "",
                "",
                "",
                Map.of(),
                "",
                0L,
                null,
                Map.of(
                        "hidden", true,
                        MESSAGES_KEY, List.copyOf(messages)
                )
        );
    }

    static String markerItemId(String runtimeTurnId) {
        if (runtimeTurnId == null || runtimeTurnId.isBlank()) {
            return MARKER_ITEM_ID;
        }
        return MARKER_ITEM_ID + ":" + runtimeTurnId;
    }

    static List<ChatMessage> decode(
            String workLogJson,
            String messageId,
            int sequence,
            ObjectMapper objectMapper
    ) {
        if (workLogJson == null || workLogJson.isBlank()) {
            return List.of();
        }
        try {
            JsonNode root = objectMapper.readTree(workLogJson);
            if (!root.isArray()) {
                return List.of();
            }
            for (JsonNode event : root) {
                if (!isMarker(event.path("itemId").asText())) {
                    continue;
                }
                JsonNode messagesNode = event.path("metadata").path(MESSAGES_KEY);
                if (!messagesNode.isArray()) {
                    return List.of();
                }
                List<Map<String, Object>> rawMessages = objectMapper.convertValue(
                        messagesNode,
                        new TypeReference<>() { }
                );
                return decodeMessages(rawMessages, messageId, sequence);
            }
        } catch (RuntimeException | com.fasterxml.jackson.core.JsonProcessingException ignored) {
            // Corrupt replay metadata must not make the conversation unreadable.
        }
        return List.of();
    }

    static boolean hasMarker(String workLogJson, ObjectMapper objectMapper) {
        if (workLogJson == null || workLogJson.isBlank()) {
            return false;
        }
        try {
            JsonNode root = objectMapper.readTree(workLogJson);
            if (!root.isArray()) {
                return false;
            }
            for (JsonNode event : root) {
                if (isMarker(event.path("itemId").asText())) {
                    return true;
                }
            }
        } catch (com.fasterxml.jackson.core.JsonProcessingException ignored) {
            // Corrupt replay metadata is treated as unavailable.
        }
        return false;
    }

    private static boolean isMarker(String itemId) {
        return MARKER_ITEM_ID.equals(itemId)
                || itemId.startsWith(MARKER_ITEM_ID + ":");
    }

    private static List<ChatMessage> decodeMessages(
            List<Map<String, Object>> rawMessages,
            String messageId,
            int sequence
    ) {
        List<ChatMessage> messages = new ArrayList<>();
        for (Map<String, Object> raw : rawMessages) {
            String role = text(raw.get("role"));
            if (!List.of("assistant", "tool").contains(role)) {
                continue;
            }
            String content = nullableText(raw.get("content"));
            List<ChatToolCall> calls = decodeToolCalls(raw.get("toolCalls"));
            String toolCallId = nullableText(raw.get("toolCallId"));
            if ("assistant".equals(role)
                    && (content == null || content.isBlank())
                    && calls.isEmpty()) {
                continue;
            }
            if ("tool".equals(role)
                    && (toolCallId == null || toolCallId.isBlank())) {
                continue;
            }
            messages.add(new ChatMessage(
                    role,
                    content,
                    null,
                    sequence,
                    calls,
                    toolCallId
            ));
        }
        if (messages.isEmpty()) {
            return List.of();
        }
        ChatMessage last = messages.get(messages.size() - 1);
        messages.set(messages.size() - 1, new ChatMessage(
                last.getRole(),
                last.getContent(),
                messageId,
                sequence,
                last.getToolCalls(),
                last.getToolCallId()
        ));
        return List.copyOf(messages);
    }

    private static List<ChatToolCall> decodeToolCalls(Object rawCalls) {
        if (!(rawCalls instanceof List<?> values)) {
            return List.of();
        }
        List<ChatToolCall> calls = new ArrayList<>();
        for (Object value : values) {
            if (!(value instanceof Map<?, ?> raw)) {
                continue;
            }
            Map<String, Object> call = new LinkedHashMap<>();
            raw.forEach((key, item) -> {
                if (key instanceof String stringKey) {
                    call.put(stringKey, item);
                }
            });
            String id = text(call.get("id"));
            String name = text(call.get("name"));
            String arguments = text(call.get("arguments"));
            if (!id.isBlank() && !name.isBlank()) {
                calls.add(new ChatToolCall(id, name, arguments));
            }
        }
        return List.copyOf(calls);
    }

    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private static String nullableText(Object value) {
        return value == null ? null : String.valueOf(value);
    }
}
