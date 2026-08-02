package com.lumora.core.service.support.conversation;

import com.lumora.core.model.ChatMessage;

import java.util.List;

/**
 * 一次模型生成所需的不可变会话上下文。
 */
public class ConversationRunContext {

    private final String taskId;
    private final String conversationId;
    private final int assistantSequence;
    private final List<ChatMessage> modelMessages;
    private final long startedAtNanos;

    public ConversationRunContext(
            String taskId,
            String conversationId,
            int assistantSequence,
            List<ChatMessage> modelMessages,
            long startedAtNanos
    ) {
        this.taskId = taskId;
        this.conversationId = conversationId;
        this.assistantSequence = assistantSequence;
        this.modelMessages = List.copyOf(modelMessages);
        this.startedAtNanos = startedAtNanos;
    }

    public String getTaskId() {
        return taskId;
    }

    public String getConversationId() {
        return conversationId;
    }

    public int getAssistantSequence() {
        return assistantSequence;
    }

    public List<ChatMessage> getModelMessages() {
        return modelMessages;
    }

    public long getStartedAtNanos() {
        return startedAtNanos;
    }
}
