package com.lumora.core.conversation.application.support;

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
import com.lumora.core.conversation.domain.model.ChatStreamEventType;
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

    private static final String CONTINUATION_INSTRUCTION =
            "继续完成上一轮尚未完成的任务。优先复用已保存的执行结果，"
                    + "不要重复已经成功完成的工具操作；先核对外部状态再继续。";

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

    public synchronized ConversationRunContext prepareNewMessage(
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

    public synchronized ConversationRunContext prepareRegeneration(
            String taskId,
            String messageId,
            String content
    ) {
        return prepareRegeneration(taskId, messageId, content, null);
    }

    public synchronized ConversationRunContext prepareRegeneration(
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

    public synchronized ConversationRunContext prepareContinuation(
            String taskId,
            String workspacePath
    ) {
        ConversationRunContext context = transactionTemplate.execute(
                status -> prepareContinuationInTransaction(
                        taskId, workspacePath
                )
        );
        if (context == null) {
            throw new IllegalStateException("无法继续会话");
        }
        return context;
    }

    public synchronized void persistAssistant(
            ConversationRunContext context,
            ConversationStreamAccumulator accumulator
    ) {
        transactionTemplate.executeWithoutResult(
                status -> insertAssistant(context, accumulator)
        );
    }

    public synchronized void persistSteerMessage(
            ConversationRunContext context,
            String content
    ) {
        transactionTemplate.executeWithoutResult(
                status -> insertSteerMessage(context, content)
        );
    }

    public synchronized void persistFailedUsage(
            ConversationRunContext context,
            ConversationStreamAccumulator accumulator
    ) {
        transactionTemplate.executeWithoutResult(
                status -> insertFailedUsage(context, accumulator)
        );
    }

    public synchronized void persistPausedTurn(
            ConversationRunContext context,
            ConversationStreamAccumulator accumulator,
            String runtimeTurnId
    ) {
        transactionTemplate.executeWithoutResult(
                status -> insertAssistant(
                        context,
                        accumulator,
                        RunProtocolContextCodec.markerItemId(runtimeTurnId)
                )
        );
    }

    public synchronized void persistRecoveredTurn(
            String taskId,
            String runtimeTurnId,
            List<ChatStreamEvent> events
    ) {
        transactionTemplate.executeWithoutResult(
                status -> insertRecoveredTurn(
                        taskId, runtimeTurnId, events
                )
        );
    }

    public synchronized void persistSupplementalUsage(
            ConversationRunContext context,
            TokenUsage usage,
            String model
    ) {
        if (!hasBillableUsage(usage)) {
            return;
        }
        transactionTemplate.executeWithoutResult(
                status -> insertSupplementalUsage(context, usage, model)
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
                .flatMap(message -> toModelMessages(message).stream())
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

    public synchronized void appendWorkLogEvent(
            String taskId,
            ChatStreamEvent event
    ) {
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
                precedingMessages,
                currentUser,
                workspacePath
        );
    }

    private ConversationRunContext prepareContinuationInTransaction(
            String taskId,
            String workspacePath
    ) {
        taskService.getTask(taskId);
        Conversation conversation = requireConversation(taskId);
        List<ConversationMessage> history = loadMessages(
                conversation.getConversationId()
        );
        if (history.isEmpty()) {
            throw new IllegalStateException("当前会话没有可继续的执行记录");
        }
        ConversationMessage currentUser = history.stream()
                .filter(message -> message.getRole() == ChatMessageRole.USER)
                .reduce((first, second) -> second)
                .orElseThrow(() -> new IllegalStateException(
                        "当前会话缺少用户消息"
                ));
        ConversationMessage parent = history.get(history.size() - 1);
        ConversationContextSummary summary = contextSummaryService.latest(
                conversation.getConversationId()
        );
        List<ConversationMessage> uncompactedHistory = summary == null
                ? history.stream().filter(this::isModelVisible).toList()
                : history.stream()
                        .filter(message -> message.getSequence()
                                > summary.getThroughSequence())
                        .filter(this::isModelVisible)
                        .toList();
        int retainedHistoryCount = Math.max(
                0, ConversationConstants.MAX_MODEL_CONTEXT_MESSAGES - 1
        );
        int firstContextIndex = Math.max(
                0, uncompactedHistory.size() - retainedHistoryCount
        );
        List<ChatMessage> modelMessages = new ArrayList<>(
                uncompactedHistory.subList(
                        firstContextIndex, uncompactedHistory.size()
                ).stream()
                        .flatMap(message -> toModelMessages(message).stream())
                        .toList()
        );
        modelMessages.add(new ChatMessage("user", CONTINUATION_INSTRUCTION));
        String projectScopeId = memoryService.resolveProjectScopeId(
                workspacePath
        );
        return new ConversationRunContext(
                taskId,
                conversation.getConversationId(),
                modelMessages,
                currentUser.getMessageId(),
                currentUser.getContent(),
                memoryService.buildPromptSummary(
                        conversation.getConversationId()
                ),
                memoryService.buildExtractionContext(
                        conversation.getConversationId(), workspacePath
                ),
                summary == null ? null : summary.getSummaryText(),
                memoryService.buildPromptCandidates(
                        conversation.getConversationId(), workspacePath
                ),
                projectScopeId,
                parent.getMessageId(),
                System.nanoTime()
        );
    }

    /**
     * 模型流正常结束后，保存完整助手消息和本次 Token、耗时信息。
     */
    private void insertAssistant(
            ConversationRunContext context,
            ConversationStreamAccumulator accumulator
    ) {
        insertAssistant(context, accumulator, (String) null);
    }

    private void insertAssistant(
            ConversationRunContext context,
            ConversationStreamAccumulator accumulator,
            String protocolMarkerId
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
                nextSequence(context.getConversationId()),
                ChatMessageRole.ASSISTANT,
                accumulator.getContent(),
                accumulator.getModel(),
                usage.getPromptTokens(),
                usage.getCompletionTokens(),
                usage.getTotalTokens(),
                durationMs,
                now
        );
        assistantMessage.setWorkLogJson(serializeWorkLog(
                accumulator,
                protocolMarkerId
        ));
        ConversationMessage parent = messageMapper.selectById(
                context.getAssistantParentMessageId()
        );
        assistantMessage.setParentMessageId(
                context.getAssistantParentMessageId()
        );
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

    private void insertSteerMessage(
            ConversationRunContext context,
            String content
    ) {
        if (content == null || content.isBlank()) {
            throw new IllegalArgumentException("引导内容不能为空");
        }
        ConversationMessage parent = messageMapper.selectById(
                context.getAssistantParentMessageId()
        );
        if (parent == null) {
            throw new IllegalStateException("引导消息缺少父消息");
        }
        Instant now = clock.instant();
        ConversationMessage message = newUserMessage(
                context.getConversationId(),
                nextSequence(context.getConversationId()),
                parent.getMessageId(),
                parent.getMessageDepth() + 1,
                content.trim(),
                now
        );
        messageMapper.insert(message);
        context.advanceAssistantParentMessageId(message.getMessageId());
        Conversation conversation = conversationMapper.selectById(
                context.getConversationId()
        );
        touchConversation(conversation, context.getTaskId(), now);
    }

    private void insertRecoveredTurn(
            String taskId,
            String runtimeTurnId,
            List<ChatStreamEvent> events
    ) {
        Conversation conversation = findConversation(taskId);
        if (conversation == null) {
            return;
        }
        String protocolMarkerId =
                RunProtocolContextCodec.markerItemId(runtimeTurnId);
        List<ConversationMessage> history = loadMessages(
                conversation.getConversationId()
        );
        if (history.isEmpty() || history.stream().anyMatch(message ->
                message.getWorkLogJson() != null
                                && message.getWorkLogJson().contains(
                                protocolMarkerId
                        )
        )) {
            return;
        }
        ConversationMessage currentUser = history.stream()
                .filter(message -> message.getRole() == ChatMessageRole.USER)
                .reduce((first, second) -> second)
                .orElse(null);
        if (currentUser == null) {
            return;
        }
        ConversationStreamAccumulator accumulator =
                new ConversationStreamAccumulator();
        for (ChatStreamEvent event : events) {
            if (event.getType() == ChatStreamEventType.FAILED
                    || event.getType() == ChatStreamEventType.COMPLETED
                    || event.getType() == ChatStreamEventType.PAUSED) {
                continue;
            }
            accumulator.accept(event);
        }
        ConversationMessage parent = history.get(history.size() - 1);
        ConversationRunContext context = new ConversationRunContext(
                taskId,
                conversation.getConversationId(),
                List.of(),
                currentUser.getMessageId(),
                currentUser.getContent(),
                null,
                null,
                null,
                List.of(),
                null,
                parent.getMessageId(),
                System.nanoTime()
        );
        insertAssistant(context, accumulator, protocolMarkerId);
    }

    /** Preserve visible partial output, or a hidden usage-only failed call. */
    private void insertFailedUsage(
            ConversationRunContext context,
            ConversationStreamAccumulator accumulator
    ) {
        if (accumulator.hasVisibleOutput()) {
            insertAssistant(
                    context,
                    accumulator,
                    RunProtocolContextCodec.MARKER_ITEM_ID
            );
            return;
        }
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

    /** Persist a hidden, billed model call triggered by a completed turn. */
    private void insertSupplementalUsage(
            ConversationRunContext context,
            TokenUsage usage,
            String model
    ) {
        Instant now = clock.instant();
        ConversationMessage usageRecord = new ConversationMessage(
                UUID.randomUUID().toString(),
                context.getConversationId(),
                nextSequence(context.getConversationId()),
                ChatMessageRole.ASSISTANT,
                "",
                model == null ? "" : model,
                usage.getPromptTokens(),
                usage.getCompletionTokens(),
                usage.getTotalTokens(),
                0L,
                now
        );
        ConversationMessage parent = messageMapper.selectById(
                context.getCurrentUserMessageId()
        );
        usageRecord.setParentMessageId(context.getCurrentUserMessageId());
        usageRecord.setMessageDepth(
                parent == null ? 1 : parent.getMessageDepth() + 1
        );
        usageRecord.setActivePath(false);
        usageRecord.setUsageRecordOnly(true);
        applyUsageDetails(usageRecord, usage);
        usageRecord.setActiveContextTokens(0);
        messageMapper.insert(usageRecord);
        Conversation conversation = conversationMapper.selectById(
                context.getConversationId()
        );
        touchConversation(conversation, context.getTaskId(), now);
    }

    private static boolean hasBillableUsage(TokenUsage usage) {
        return usage != null && (
                usage.getTotalTokens() > 0
                        || usage.getPromptTokens() > 0
                        || usage.getCompletionTokens() > 0
                        || usage.getInputTokens() > 0
                        || usage.getOutputTokens() > 0
                        || usage.getReasoningTokens() > 0
                        || usage.getCacheReadTokens() > 0
                        || usage.getCacheWriteTokens() > 0
        );
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
            ConversationStreamAccumulator accumulator,
            String protocolMarkerId
    ) {
        try {
            List<ChatStreamEvent> events = new ArrayList<>(
                    accumulator.getWorkLogEvents()
            );
            if (protocolMarkerId != null
                    || !accumulator.getProtocolMessages().isEmpty()) {
                events.add(RunProtocolContextCodec.marker(
                        accumulator.getModel(),
                        accumulator.getProtocolMessages(),
                        protocolMarkerId == null
                                ? RunProtocolContextCodec.MARKER_ITEM_ID
                                : protocolMarkerId
                ));
            }
            return objectMapper.writeValueAsString(
                    events
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
                        .flatMap(message -> toModelMessages(message).stream())
                        .toList()
        );
        modelMessages.addAll(toModelMessages(currentUserMessage));
        String projectScopeId = memoryService.resolveProjectScopeId(
                workspacePath
        );
        return new ConversationRunContext(
                taskId,
                conversationId,
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

    private List<ChatMessage> toModelMessages(ConversationMessage message) {
        List<ChatMessage> protocolMessages = RunProtocolContextCodec.decode(
                message.getWorkLogJson(),
                message.getMessageId(),
                message.getSequence(),
                objectMapper
        );
        if (!protocolMessages.isEmpty()) {
            return protocolMessages;
        }
        if (RunProtocolContextCodec.hasMarker(
                message.getWorkLogJson(), objectMapper
        )) {
            // A newly sealed turn that ended before a complete assistant
            // message has no provider-visible replay state. Its partial text
            // remains UI-only, matching the append-only Harness model.
            return List.of();
        }
        return List.of(new ChatMessage(
                message.getRole().name().toLowerCase(),
                message.getContent(),
                message.getMessageId(),
                message.getSequence()
        ));
    }

    private boolean isModelVisible(ConversationMessage message) {
        return !message.isUsageRecordOnly() && (
                message.getRole() != ChatMessageRole.ASSISTANT
                || (message.getContent() != null
                && !message.getContent().isBlank())
                || RunProtocolContextCodec.hasMarker(
                message.getWorkLogJson(), objectMapper
                )
                || message.getWorkLogJson() == null
                || message.getWorkLogJson().equals("[]")
        );
    }
}
