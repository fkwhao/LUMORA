package com.lumora.core.conversation.application.support;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lumora.core.conversation.domain.model.MessageAttachment;

import java.util.List;

/** Metadata codec shared by run, queue, and message persistence. */
public final class MessageAttachmentJson {
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final TypeReference<List<MessageAttachment>> LIST_TYPE =
            new TypeReference<>() { };

    private MessageAttachmentJson() {
    }

    public static String encode(List<MessageAttachment> attachments) {
        try {
            return MAPPER.writeValueAsString(
                    MessageAttachment.normalize(attachments)
            );
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("无法保存附件引用", error);
        }
    }

    public static List<MessageAttachment> decode(String json) {
        if (json == null || json.isBlank() || "[]".equals(json)) {
            return List.of();
        }
        try {
            return MessageAttachment.normalize(MAPPER.readValue(json, LIST_TYPE));
        } catch (JsonProcessingException | IllegalArgumentException error) {
            throw new IllegalStateException("附件引用数据已损坏", error);
        }
    }
}
