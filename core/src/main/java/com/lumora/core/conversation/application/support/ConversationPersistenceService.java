package com.lumora.core.conversation.application.support;

import com.lumora.core.conversation.domain.model.ConversationConstants;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lumora.core.conversation.domain.model.ConversationConstants;
import com.lumora.core.conversation.domain.model.ChatMessageRole;
import com.lumora.core.conversation.domain.entity.Conversation;
import com.lumora.core.conversation.domain.entity.ConversationMessage;
import com.lumora.core.conversation.domain.entity.ConversationContextSummary;
import com.lumora.core.conversation.infrastructure.persistence.ConversationMapper;
import com.lumora.core.conversation.infrastructure.persistence.ConversationMessageMapper;
import com.lumora.core.conversation.domain.model.ChatMessage;
import com.lumora.core.conversation.domain.model.ChatStreamEvent;
import com.lumora.core.conversation.domain.model.TokenUsage;
import com.lumora.core.task.application.service.TaskService;
import com.lumora.core.memory.application.service.MemoryService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * 会话和消息的数据库事务边界。
 */
@Service
@RequiredArgsConstructor
public class ConversationPersistenceService {

    private final ConversationMapper conversationMapper;
    private final ConversationMessageMapper messageMapper;
    private final TaskService taskService;
    private final MemoryService memoryService;
    private final ConversationContextSummaryService contextSummaryService;
    private final Clock clock;
    private final TransactionTemplate transactionTemplate;
    private final ObjectMapper objectMapper;

    public List<ConversationMessage> listMessages(String taskId) {
        taskService.getTask(taskId);
        Conversation conversation = findConversation(taskId);
        return conversation == null
                ? List.of()
                : loadAllMessages(conversation.getConversationId());
    }

    public void activateBranch(String taskId, String messageId) {
        transactionTemplate.executeWithoutResult(
                status -> activateBranchInTransaction(taskId, messageId)
        );
    }

    public ConversationRunContext prepareNewMessage(
            String taskId,
            String content
    ) {
        return prepareNewMessage(taskId, content, null);
    }

    public ConversationRunContext prepareNewMessage(
            String taskId,
            String content,
            String workspacePath
    ) {
        // 用户消息和后续模型上下文必须在同一事务内生成，避免消息已落库但上下文不完整。
        ConversationRunContext context = transactionTemplate.execute(
                status -> prepareNewMessageInTransaction(
                        taskId, content, workspacePath
                )
        );
        if (context == null) {
            throw new IllegalStateException("无法创建会话");
        }
        return context;
    }

    public ConversationRunContext prepareRegeneration(
            String taskId,
            String messageId,
            String content
    ) {
        return prepareRegeneration(taskId, messageId, content, null);
    }

    public ConversationRunContext prepareRegeneration(
            String taskId,
            String messageId,
            String content,
            String workspacePath
    ) {
        // 重新生成会删除旧回答，必须和用户消息更新保持原子性。
        ConversationRunContext context = transactionTemplate.execute(
                status -> prepareRegenerationInTransaction(
                        taskId,
                        messageId,
                        content,
                        workspacePath
                )
        );
        if (context == null) {
            throw new IllegalStateException("无法重新生成回复");
        }
        return context;
    }

    public void persistAssistant(
            ConversationRunContext context,
            ConversationStreamAccumulator accumulator
    ) {
        transactionTemplate.executeWithoutResult(
                status -> insertAssistant(context, accumulator)
        );
    }

    public void persistFailedUsage(
            ConversationRunContext context,
            ConversationStreamAccumulator accumulator
    ) {
        transactionTemplate.executeWithoutResult(
                status -> insertFailedUsage(context, accumulator)
        );
    }

    public ContextCompactionInput prepareCompaction(String taskId) {
        taskService.getTask(taskId);
        Conversation conversation = requireConversation(taskId);
        List<ConversationMessage> history = loadMessages(
                conversation.getConversationId()
        );
        if (history.isEmpty()) {
            throw new IllegalArgumentException("当前会话没有可压缩的消息");
        }
        ConversationContextSummary summary = contextSummaryService.latest(
                conversation.getConversationId()
        );
        List<ChatMessage> messages = history.stream()
                .filter(message -> summary == null
                        || message.getSequence() > summary.getThroughSequence())
                .filter(this::isModelVisible)
                .map(this::toModelMessage)
                .toList();
        if (messages.isEmpty()) {
            throw new IllegalArgumentException("当前会话已经完成压缩");
        }
        return new ContextCompactionInput(
                conversation.getConversationId(), messages,
                memoryService.buildPromptSummary(conversation.getConversationId()),
                summary == null ? null : summary.getSummaryText()
        );
    }

    public void appendWorkLogEvent(String taskId, ChatStreamEvent event) {
        transactionTemplate.executeWithoutResult(
                status -> insertWorkLogMessage(taskId, event)
        );
    }

    private void insertWorkLogMessage(String taskId, ChatStreamEvent event) {
        Conversation conversation = requireConversation(taskId);
        List<ConversationMessage> history = loadMessages(
                conversation.getConversationId()
        );
        TokenUsage usage = event.getUsage() == null
                ? new TokenUsage(0, 0, 0)
                : event.getUsage();
        Instant now = clock.instant();
        ConversationMessage activity = new ConversationMessage(
                UUID.randomUUID().toString(),
                conversation.getConversationId(),
                nextSequence(conversation.getConversationId()),
                ChatMessageRole.ASSISTANT,
                "",
                event.getModel(),
                usage.getPromptTokens(),
                usage.getCompletionTokens(),
                usage.getTotalTokens(),
                0L,
                now
        );
        ConversationMessage parent = history.isEmpty()
                ? null : history.get(history.size() - 1);
        activity.setParentMessageId(
                parent == null ? null : parent.getMessageId()
        );
        activity.setMessageDepth(
                parent == null ? 1 : parent.getMessageDepth() + 1
        );
        activity.setActivePath(true);
        applyUsageDetails(activity, usage);
        try {
            activity.setWorkLogJson(objectMapper.writeValueAsString(
                    List.of(WorkLogEventProjector.project(event))
            ));
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("无法保存上下文压缩记录", error);
        }
        activity.setActiveContextTokens(event.getActiveContextTokens());
        messageMapper.insert(activity);
        touchConversation(conversation, taskId, now);
    }

    /**
     * 准备一次新对话：确认任务、保存用户消息并构造本次模型上下文。
     */
    private ConversationRunContext prepareNewMessageInTransaction(
            String taskId,
            String content,
            String workspacePath
    ) {
        // 1. 确认任务存在，并取得任务唯一会话。
        taskService.getTask(taskId);
        Conversation conversation = getOrCreateConversation(taskId);

        // 2. 保存用户消息，消息序号严格接续已有历史。
        List<ConversationMessage> history = loadMessages(
                conversation.getConversationId()
        );
        int sequence = nextSequence(conversation.getConversationId());
        Instant now = clock.instant();
        ConversationMessage userMessage = newUserMessage(
                conversation.getConversationId(),
                sequence,
                history.isEmpty() ? null : history.get(history.size() - 1)
                        .getMessageId(),
                history.size() + 1,
                content,
                now
        );
        messageMapper.insert(userMessage);
        touchConversation(conversation, taskId, now);

        // 3. 只保留模型上下文上限内的最近消息，防止请求无限膨胀。
        return createRunContext(
                taskId,
                conversation.getConversationId(),
                sequence + 1,
                history,
                userMessage,
                workspacePath
        );
    }

    /**
     * 重新生成只允许修改最后一条用户消息，并删除它之后已经失效的回答。
     */
    private ConversationRunContext prepareRegenerationInTransaction(
            String taskId,
            String messageId,
            String content,
            String workspacePath
    ) {
        // 1. 找到并校验允许编辑的最后一条用户消息。
        taskService.getTask(taskId);
        Conversation conversation = requireConversation(taskId);
        List<ConversationMessage> history = loadMessages(
                conversation.getConversationId()
        );
        ConversationMessage target = requireEditableMessage(
                history,
                messageId
        );

        // 2. 保留旧路径作为历史分支，并激活新路径。
        Instant now = clock.instant();
        deactivateAfter(conversation.getConversationId(), target);
        ConversationMessage currentUser = target;
        if (!target.getContent().equals(content)) {
            target.setActivePath(false);
            messageMapper.updateById(target);
            currentUser = newUserMessage(
                    conversation.getConversationId(),
                    nextSequence(conversation.getConversationId()),
                    target.getParentMessageId(),
                    target.getMessageDepth(),
                    content,
                    now
            );
            messageMapper.insert(currentUser);
        }
        touchConversation(conversation, taskId, now);

        // 3. 使用编辑点之前的历史重新构造模型上下文。
        List<ConversationMessage> precedingMessages = history.stream()
                .filter(message -> message.getMessageDepth()
                        < target.getMessageDepth())
                .toList();
        return createRunContext(
                taskId,
                conversation.getConversationId(),
                nextSequence(conversation.getConversationId()),
                precedingMessages,
                currentUser,
                workspacePath
        );
    }

    /**
     * 模型流正常结束后，保存完整助手消息和本次 Token、耗时信息。
     */
    private void insertAssistant(
            ConversationRunContext context,
            ConversationStreamAccumulator accumulator
    ) {
        TokenUsage usage = accumulator.getUsage() == null
                ? new TokenUsage(0, 0, 0)
                : accumulator.getUsage();
        Instant now = clock.instant();
        long durationMs = Math.max(
                1L,
                (System.nanoTime() - context.getStartedAtNanos())
                        / 1_000_000L
        );
        ConversationMessage assistantMessage = new ConversationMessage(
                UUID.randomUUID().toString(),
                context.getConversationId(),
                context.getAssistantSequence(),
                ChatMessageRole.ASSISTANT,
                accumulator.getContent(),
                accumulator.getModel(),
                usage.getPromptTokens(),
                usage.getCompletionTokens(),
                usage.getTotalTokens(),
                durationMs,
                now
        );
        assistantMessage.setWorkLogJson(serializeWorkLog(accumulator));
        ConversationMessage parent = messageMapper.selectById(
                context.getCurrentUserMessageId()
        );
        assistantMessage.setParentMessageId(context.getCurrentUserMessageId());
        assistantMessage.setMessageDepth(parent.getMessageDepth() + 1);
        assistantMessage.setActivePath(true);
        applyUsageDetails(assistantMessage, usage);
        assistantMessage.setActiveContextTokens(
                accumulator.getActiveContextTokens()
        );
        messageMapper.insert(assistantMessage);
        Conversation conversation = conversationMapper.selectById(
                context.getConversationId()
        );
        touchConversation(conversation, context.getTaskId(), now);
    }

    /**
     * Preserve provider billing from a run that failed after reporting usage.
     * The row participates in durable totals but never becomes a chat branch.
     */
    private void insertFailedUsage(
            ConversationRunContext context,
            ConversationStreamAccumulator accumulator
    ) {
        TokenUsage usage = accumulator.getUsage();
        if (usage == null) {
            return;
        }
        Instant now = clock.instant();
        long durationMs = Math.max(
                1L,
                (System.nanoTime() - context.getStartedAtNanos())
                        / 1_000_000L
        );
        ConversationMessage usageRecord = new ConversationMessage(
                UUID.randomUUID().toString(),
                context.getConversationId(),
                nextSequence(context.getConversationId()),
                ChatMessageRole.ASSISTANT,
                "",
                accumulator.getModel(),
                usage.getPromptTokens(),
                usage.getCompletionTokens(),
                usage.getTotalTokens(),
                durationMs,
                now
        );
        ConversationMessage parent = messageMapper.selectById(
                context.getCurrentUserMessageId()
        );
        usageRecord.setParentMessageId(context.getCurrentUserMessageId());
        usageRecord.setMessageDepth(parent.getMessageDepth() + 1);
        usageRecord.setActivePath(false);
        usageRecord.setUsageRecordOnly(true);
        applyUsageDetails(usageRecord, usage);
        usageRecord.setActiveContextTokens(
                accumulator.getActiveContextTokens()
        );
        messageMapper.insert(usageRecord);
        Conversation conversation = conversationMapper.selectById(
                context.getConversationId()
        );
        touchConversation(conversation, context.getTaskId(), now);
    }

    private void applyUsageDetails(
            ConversationMessage message,
            TokenUsage usage
    ) {
        message.applyUsageDetails(
                usage.getInputTokens(),
                usage.getOutputTokens(),
                usage.getReasoningTokens(),
                usage.getCacheReadTokens(),
                usage.getCacheWriteTokens(),
                usage.isCacheMetricsAvailable()
        );
    }

    private String serializeWorkLog(
            ConversationStreamAccumulator accumulator
    ) {
        try {
            return objectMapper.writeValueAsString(
                    accumulator.getWorkLogEvents()
            );
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("无法保存工作过程记录", error);
        }
    }

    private void deactivateAfter(
            String conversationId,
            ConversationMessage target
    ) {
        loadMessages(conversationId).stream()
                .filter(message -> message.getMessageDepth()
                        > target.getMessageDepth())
                .forEach(message -> {
                    message.setActivePath(false);
                    messageMapper.updateById(message);
                });
    }

    private ConversationRunContext createRunContext(
            String taskId,
            String conversationId,
            int assistantSequence,
            List<ConversationMessage> history,
            ConversationMessage currentUserMessage,
            String workspacePath
    ) {
        ConversationContextSummary summary = contextSummaryService.latest(
                conversationId
        );
        List<ConversationMessage> uncompactedHistory = summary == null
                ? history.stream().filter(this::isModelVisible).toList()
                : history.stream()
                        .filter(message -> message.getSequence()
                                > summary.getThroughSequence())
                        .filter(this::isModelVisible)
                        .toList();
        int retainedHistoryCount = Math.max(
                0,
                ConversationConstants.MAX_MODEL_CONTEXT_MESSAGES - 1
        );
        int firstContextIndex = Math.max(
                0,
                uncompactedHistory.size() - retainedHistoryCount
        );
        List<ChatMessage> modelMessages = new ArrayList<>(
                uncompactedHistory.subList(
                        firstContextIndex, uncompactedHistory.size()
                )
                        .stream()
                        .map(this::toModelMessage)
                        .toList()
        );
        modelMessages.add(toModelMessage(currentUserMessage));
        String projectScopeId = memoryService.resolveProjectScopeId(
                workspacePath
        );
        return new ConversationRunContext(
                taskId,
                conversationId,
                assistantSequence,
                modelMessages,
                currentUserMessage.getMessageId(),
                currentUserMessage.getContent(),
                memoryService.buildPromptSummary(conversationId),
                memoryService.buildExtractionContext(
                        conversationId, workspacePath
                ),
                summary == null ? null : summary.getSummaryText(),
                memoryService.buildPromptCandidates(
                        conversationId, workspacePath
                ),
                projectScopeId,
                System.nanoTime()
        );
    }

    private Conversation getOrCreateConversation(String taskId) {
        Conversation existing = findConversation(taskId);
        if (existing != null) {
            return existing;
        }
        Instant now = clock.instant();
        Conversation created = new Conversation(
                UUID.randomUUID().toString(),
                taskId,
                now,
                now
        );
        conversationMapper.insert(created);
        return created;
    }

    private Conversation requireConversation(String taskId) {
        Conversation conversation = findConversation(taskId);
        if (conversation == null) {
            throw new IllegalArgumentException("任务会话不存在");
        }
        return conversation;
    }

    private ConversationMessage requireEditableMessage(
            List<ConversationMessage> history,
            String messageId
    ) {
        ConversationMessage target = history.stream()
                .filter(message -> messageId.equals(message.getMessageId()))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException(
                        "待编辑消息不存在"
                ));
        if (target.getRole() != ChatMessageRole.USER) {
            throw new IllegalArgumentException("只能编辑用户消息");
        }
        boolean hasLaterUserMessage = history.stream().anyMatch(
                message -> message.getSequence() > target.getSequence()
                        && message.getRole() == ChatMessageRole.USER
        );
        if (hasLaterUserMessage) {
            throw new IllegalArgumentException("只能编辑最后一条用户消息");
        }
        return target;
    }

    private ConversationMessage newUserMessage(
            String conversationId,
            int sequence,
            String parentMessageId,
            int messageDepth,
            String content,
            Instant now
    ) {
        ConversationMessage message = new ConversationMessage(
                UUID.randomUUID().toString(),
                conversationId,
                sequence,
                ChatMessageRole.USER,
                content,
                "",
                0,
                0,
                0,
                now
        );
        message.setParentMessageId(parentMessageId);
        message.setMessageDepth(messageDepth);
        message.setActivePath(true);
        return message;
    }

    private void touchConversation(
            Conversation conversation,
            String taskId,
            Instant now
    ) {
        conversation.setUpdatedAt(now);
        conversationMapper.updateById(conversation);
        taskService.touchTask(taskId);
    }

    private Conversation findConversation(String taskId) {
        return conversationMapper.selectOne(
                Wrappers.<Conversation>lambdaQuery()
                        .eq(Conversation::getTaskId, taskId)
        );
    }

    private List<ConversationMessage> loadMessages(String conversationId) {
        return messageMapper.selectList(
                Wrappers.<ConversationMessage>lambdaQuery()
                        .eq(
                                ConversationMessage::getConversationId,
                                conversationId
                        )
                        .eq(ConversationMessage::isActivePath, true)
                        .orderByAsc(ConversationMessage::getMessageDepth)
        );
    }

    private List<ConversationMessage> loadAllMessages(String conversationId) {
        return messageMapper.selectList(
                Wrappers.<ConversationMessage>lambdaQuery()
                        .eq(ConversationMessage::getConversationId,
                                conversationId)
                        .orderByAsc(ConversationMessage::getSequence)
        );
    }

    private int nextSequence(String conversationId) {
        return loadAllMessages(conversationId).stream()
                .mapToInt(ConversationMessage::getSequence)
                .max()
                .orElse(0) + 1;
    }

    private void activateBranchInTransaction(String taskId, String messageId) {
        taskService.getTask(taskId);
        Conversation conversation = requireConversation(taskId);
        List<ConversationMessage> all = loadAllMessages(
                conversation.getConversationId()
        );
        java.util.Map<String, ConversationMessage> byId = all.stream()
                .collect(java.util.stream.Collectors.toMap(
                        ConversationMessage::getMessageId,
                        message -> message
                ));
        ConversationMessage cursor = byId.get(messageId);
        if (cursor == null || cursor.isUsageRecordOnly()) {
            throw new IllegalArgumentException("回复分支不存在");
        }
        ConversationMessage child;
        do {
            String parentId = cursor.getMessageId();
            child = all.stream()
                    .filter(message -> !message.isUsageRecordOnly())
                    .filter(message -> parentId.equals(
                            message.getParentMessageId()
                    ))
                    .max(java.util.Comparator.comparingInt(
                            ConversationMessage::getSequence
                    ))
                    .orElse(null);
            if (child != null) cursor = child;
        } while (child != null);
        java.util.Set<String> activeIds = new java.util.HashSet<>();
        while (cursor != null) {
            activeIds.add(cursor.getMessageId());
            cursor = cursor.getParentMessageId() == null
                    ? null : byId.get(cursor.getParentMessageId());
        }
        all.forEach(message -> {
            boolean active = activeIds.contains(message.getMessageId());
            if (message.isActivePath() != active) {
                message.setActivePath(active);
                messageMapper.updateById(message);
            }
        });
        touchConversation(conversation, taskId, clock.instant());
    }

    private ChatMessage toModelMessage(ConversationMessage message) {
        return new ChatMessage(
                message.getRole().name().toLowerCase(),
                message.getContent(),
                message.getMessageId(),
                message.getSequence()
        );
    }

    private boolean isModelVisible(ConversationMessage message) {
        return !message.isUsageRecordOnly() && (
                message.getRole() != ChatMessageRole.ASSISTANT
                || (message.getContent() != null
                && !message.getContent().isBlank())
                || message.getWorkLogJson() == null
                || message.getWorkLogJson().equals("[]")
        );
    }
}
