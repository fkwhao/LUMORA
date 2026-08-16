package com.lumora.core.conversation.application.support;

import com.lumora.core.conversation.domain.model.ChatMessage;
import com.lumora.core.memory.domain.model.MemoryContextItem;

import java.util.List;

/**
 * 一次模型生成所需的不可变会话上下文。
 */
public class ConversationRunContext {

    private final String taskId;
    private final String conversationId;
    private final List<ChatMessage> modelMessages;
    private final String currentUserMessageId;
    private volatile String assistantParentMessageId;
    private final String currentUserContent;
    private final String memorySummary;
    private final String memoryExtractionContext;
    private final List<MemoryContextItem> memoryCandidates;
    private final String projectScopeId;
    private final String conversationSummary;
    private final long startedAtNanos;

    public ConversationRunContext(
            String taskId,
            String conversationId,
            List<ChatMessage> modelMessages,
            String currentUserMessageId,
            String currentUserContent,
            String memorySummary,
            String memoryExtractionContext,
            String conversationSummary,
            long startedAtNanos
    ) {
        this(taskId, conversationId, modelMessages,
                currentUserMessageId, currentUserContent, memorySummary,
                memoryExtractionContext, conversationSummary, List.of(), null,
                currentUserMessageId, startedAtNanos);
    }

    public ConversationRunContext(
            String taskId,
            String conversationId,
            List<ChatMessage> modelMessages,
            String currentUserMessageId,
            String currentUserContent,
            String memorySummary,
            String memoryExtractionContext,
            String conversationSummary,
            List<MemoryContextItem> memoryCandidates,
            String projectScopeId,
            long startedAtNanos
    ) {
        this(taskId, conversationId, modelMessages,
                currentUserMessageId, currentUserContent, memorySummary,
                memoryExtractionContext, conversationSummary,
                memoryCandidates, projectScopeId, currentUserMessageId,
                startedAtNanos);
    }

    public ConversationRunContext(
            String taskId,
            String conversationId,
            List<ChatMessage> modelMessages,
            String currentUserMessageId,
            String currentUserContent,
            String memorySummary,
            String memoryExtractionContext,
            String conversationSummary,
            List<MemoryContextItem> memoryCandidates,
            String projectScopeId,
            String assistantParentMessageId,
            long startedAtNanos
    ) {
        this.taskId = taskId;
        this.conversationId = conversationId;
        this.modelMessages = List.copyOf(modelMessages);
        this.currentUserMessageId = currentUserMessageId;
        this.assistantParentMessageId = assistantParentMessageId;
        this.currentUserContent = currentUserContent;
        this.memorySummary = memorySummary;
        this.memoryExtractionContext = memoryExtractionContext;
        this.memoryCandidates = List.copyOf(memoryCandidates);
        this.projectScopeId = projectScopeId;
        this.conversationSummary = conversationSummary;
        this.startedAtNanos = startedAtNanos;
    }

    public ConversationRunContext(
            String taskId,
            String conversationId,
            List<ChatMessage> modelMessages,
            String currentUserMessageId,
            String currentUserContent,
            String memorySummary,
            String memoryExtractionContext,
            long startedAtNanos
    ) {
        this(taskId, conversationId, modelMessages,
                currentUserMessageId, currentUserContent, memorySummary,
                memoryExtractionContext, null, startedAtNanos);
    }

    public String getTaskId() {
        return taskId;
    }

    public String getConversationId() {
        return conversationId;
    }

    public List<ChatMessage> getModelMessages() {
        return modelMessages;
    }

    public String getMemorySummary() {
        return memorySummary;
    }

    public String getCurrentUserMessageId() {
        return currentUserMessageId;
    }

    public String getAssistantParentMessageId() {
        return assistantParentMessageId;
    }

    public void advanceAssistantParentMessageId(String messageId) {
        if (messageId == null || messageId.isBlank()) {
            throw new IllegalArgumentException("助手父消息 ID 不能为空");
        }
        assistantParentMessageId = messageId;
    }

    public String getCurrentUserContent() {
        return currentUserContent;
    }

    public String getMemoryExtractionContext() {
        return memoryExtractionContext;
    }

    public List<MemoryContextItem> getMemoryCandidates() {
        return memoryCandidates;
    }

    public String getProjectScopeId() { return projectScopeId; }

    public String getConversationSummary() { return conversationSummary; }

    public long getStartedAtNanos() {
        return startedAtNanos;
    }
}
