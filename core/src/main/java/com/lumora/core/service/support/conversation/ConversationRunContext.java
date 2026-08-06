package com.lumora.core.service.support.conversation;

import com.lumora.core.model.ChatMessage;
import com.lumora.core.model.MemoryContextItem;

import java.util.List;

/**
 * 一次模型生成所需的不可变会话上下文。
 */
public class ConversationRunContext {

    private final String taskId;
    private final String conversationId;
    private final int assistantSequence;
    private final List<ChatMessage> modelMessages;
    private final String currentUserMessageId;
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
            int assistantSequence,
            List<ChatMessage> modelMessages,
            String currentUserMessageId,
            String currentUserContent,
            String memorySummary,
            String memoryExtractionContext,
            String conversationSummary,
            long startedAtNanos
    ) {
        this(taskId, conversationId, assistantSequence, modelMessages,
                currentUserMessageId, currentUserContent, memorySummary,
                memoryExtractionContext, conversationSummary, List.of(), null,
                startedAtNanos);
    }

    public ConversationRunContext(
            String taskId,
            String conversationId,
            int assistantSequence,
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
        this.taskId = taskId;
        this.conversationId = conversationId;
        this.assistantSequence = assistantSequence;
        this.modelMessages = List.copyOf(modelMessages);
        this.currentUserMessageId = currentUserMessageId;
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
            int assistantSequence,
            List<ChatMessage> modelMessages,
            String currentUserMessageId,
            String currentUserContent,
            String memorySummary,
            String memoryExtractionContext,
            long startedAtNanos
    ) {
        this(taskId, conversationId, assistantSequence, modelMessages,
                currentUserMessageId, currentUserContent, memorySummary,
                memoryExtractionContext, null, startedAtNanos);
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

    public String getMemorySummary() {
        return memorySummary;
    }

    public String getCurrentUserMessageId() {
        return currentUserMessageId;
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
