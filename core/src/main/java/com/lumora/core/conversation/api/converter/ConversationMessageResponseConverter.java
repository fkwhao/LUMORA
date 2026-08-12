package com.lumora.core.conversation.api.converter;

import com.lumora.core.conversation.api.dto.response.ConversationMessageResponse;
import com.lumora.core.conversation.api.dto.response.TokenUsageResponse;
import com.lumora.core.conversation.domain.entity.ConversationMessage;
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
                message.getParentMessageId(),
                message.getMessageDepth(),
                message.isActivePath(),
                message.getRole().name().toLowerCase(),
                message.getContent(),
                message.getModel(),
                new TokenUsageResponse(
                        message.getPromptTokens(),
                        message.getCompletionTokens(),
                        message.getTotalTokens(),
                        message.getInputTokens(),
                        message.getOutputTokens(),
                        message.getReasoningTokens(),
                        message.getCacheReadTokens(),
                        message.getCacheWriteTokens(),
                        message.isCacheMetricsAvailable()
                ),
                message.getActiveContextTokens(),
                message.getDurationMs(),
                message.getWorkLogJson(),
                message.getCreatedAt()
        );
    }
}
