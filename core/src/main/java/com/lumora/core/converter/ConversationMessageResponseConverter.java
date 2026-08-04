package com.lumora.core.converter;

import com.lumora.core.dto.response.ConversationMessageResponse;
import com.lumora.core.dto.response.TokenUsageResponse;
import com.lumora.core.entity.ConversationMessage;
import org.springframework.stereotype.Component;

/** 隔离会话持久化实体与 REST DTO。 */
@Component
public class ConversationMessageResponseConverter {

    public ConversationMessageResponse fromEntity(
            ConversationMessage message
    ) {
        return new ConversationMessageResponse(
                message.getMessageId(),
                message.getSequence(),
                message.getRole().name().toLowerCase(),
                message.getContent(),
                message.getModel(),
                new TokenUsageResponse(
                        message.getPromptTokens(),
                        message.getCompletionTokens(),
                        message.getTotalTokens()
                ),
                message.getDurationMs(),
                message.getWorkLogJson(),
                message.getCreatedAt()
        );
    }
}
