package com.lumora.core.service.impl;

import com.lumora.core.entity.ConversationMessage;
import com.lumora.core.model.ChatStreamEvent;
import com.lumora.core.model.ChatStreamEventType;
import com.lumora.core.service.ConversationService;
import com.lumora.core.service.ModelService;
import com.lumora.core.service.support.conversation.ConversationPersistenceService;
import com.lumora.core.service.support.conversation.ConversationRunContext;
import com.lumora.core.service.support.conversation.ConversationStreamAccumulator;
import com.lumora.core.service.support.memory.MemoryExtractionCoordinator;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.FutureTask;
import java.util.function.Consumer;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 会话业务编排器。
 *
 * <p>本类只管理生成流程和同任务并发约束；数据库事务由
 * {@link ConversationPersistenceService} 负责。</p>
 */
@Service
@RequiredArgsConstructor
public class ConversationServiceImpl implements ConversationService {

    private static final Logger LOGGER = LoggerFactory.getLogger(
            ConversationServiceImpl.class
    );

    private final ConversationPersistenceService persistenceService;
    private final ModelService modelService;
    private final ExecutorService executorService;
    private final MemoryExtractionCoordinator memoryExtractionCoordinator;
    private final ConcurrentHashMap<String, FutureTask<Void>> activeRuns =
            new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, PendingToolApproval>
            pendingToolApprovals = new ConcurrentHashMap<>();

    private record PendingToolApproval(String taskId, String correlationId) {
    }

    @Override
    public List<ConversationMessage> listMessages(String taskId) {
        return persistenceService.listMessages(taskId);
    }

    @Override
    public void streamMessage(
            String taskId,
            String content,
            String model,
            String reasoningEffort,
            String workspacePath,
            String permissionMode,
            String correlationId,
            Consumer<ChatStreamEvent> eventConsumer,
            Runnable completionCallback,
            Consumer<Throwable> errorCallback
    ) {
        String normalizedContent = requireText(content, "消息内容");
        startGeneration(
                taskId,
                requireText(correlationId, "关联 ID"),
                model,
                reasoningEffort,
                workspacePath,
                permissionMode,
                () -> persistenceService.prepareNewMessage(
                        taskId,
                        normalizedContent
                ),
                eventConsumer,
                completionCallback,
                errorCallback
        );
    }

    @Override
    public void regenerateMessage(
            String taskId,
            String messageId,
            String content,
            String model,
            String reasoningEffort,
            String workspacePath,
            String permissionMode,
            String correlationId,
            Consumer<ChatStreamEvent> eventConsumer,
            Runnable completionCallback,
            Consumer<Throwable> errorCallback
    ) {
        String normalizedMessageId = requireText(messageId, "消息 ID");
        String normalizedContent = requireText(content, "消息内容");
        startGeneration(
                taskId,
                requireText(correlationId, "关联 ID"),
                model,
                reasoningEffort,
                workspacePath,
                permissionMode,
                () -> persistenceService.prepareRegeneration(
                        taskId,
                        normalizedMessageId,
                        normalizedContent
                ),
                eventConsumer,
                completionCallback,
                errorCallback
        );
    }

    private synchronized void startGeneration(
            String taskId,
            String correlationId,
            String model,
            String reasoningEffort,
            String workspacePath,
            String permissionMode,
            Supplier<ConversationRunContext> contextSupplier,
            Consumer<ChatStreamEvent> eventConsumer,
            Runnable completionCallback,
            Consumer<Throwable> errorCallback
    ) {
        if (activeRuns.containsKey(taskId)) {
            throw new IllegalStateException("当前任务正在生成回复");
        }

        try {
            ConversationRunContext context = contextSupplier.get();
            FutureTask<Void> run = new FutureTask<>(() -> {
                executeStream(
                        context,
                        correlationId,
                        model,
                        reasoningEffort,
                        workspacePath,
                        permissionMode,
                        eventConsumer,
                        completionCallback,
                        errorCallback
                );
                return null;
            }) {
                @Override
                protected void done() {
                    activeRuns.remove(taskId, this);
                }
            };
            activeRuns.put(taskId, run);
            executorService.execute(run);
        } catch (RuntimeException error) {
            activeRuns.remove(taskId);
            throw error;
        }
    }

    @Override
    public boolean cancelGeneration(String taskId) {
        FutureTask<Void> run = activeRuns.remove(taskId);
        pendingToolApprovals.entrySet().removeIf(
                entry -> entry.getValue().taskId().equals(taskId)
        );
        return run != null && run.cancel(true);
    }

    @Override
    public void decideToolApproval(
            String taskId,
            String approvalId,
            String decision
    ) {
        String normalizedTaskId = requireText(taskId, "任务 ID");
        String normalizedApprovalId = requireText(approvalId, "审批 ID");
        String normalizedDecision = requireText(decision, "审批决定");
        if (!List.of("allow_once", "allow_always", "deny")
                .contains(normalizedDecision)) {
            throw new IllegalArgumentException("审批决定无效");
        }
        PendingToolApproval pending = pendingToolApprovals.get(
                normalizedApprovalId
        );
        if (pending == null || !pending.taskId().equals(normalizedTaskId)) {
            throw new IllegalArgumentException("审批不存在或不属于当前任务");
        }
        if (!pendingToolApprovals.remove(normalizedApprovalId, pending)) {
            throw new IllegalStateException("审批正在由其他请求处理");
        }
        try {
            modelService.decideToolApproval(
                    normalizedApprovalId,
                    normalizedDecision,
                    pending.correlationId()
            );
        } catch (RuntimeException error) {
            pendingToolApprovals.putIfAbsent(normalizedApprovalId, pending);
            throw error;
        }
    }

    private void executeStream(
            ConversationRunContext context,
            String correlationId,
            String model,
            String reasoningEffort,
            String workspacePath,
            String permissionMode,
            Consumer<ChatStreamEvent> eventConsumer,
            Runnable completionCallback,
            Consumer<Throwable> errorCallback
    ) {
        ConversationStreamAccumulator accumulator =
                new ConversationStreamAccumulator();
        try {
            modelService.streamChat(
                    context.getModelMessages(),
                    correlationId,
                    model,
                    reasoningEffort,
                    context.getMemorySummary(),
                    workspacePath,
                    permissionMode,
                    event -> handleStreamEvent(
                            context,
                            accumulator,
                            event,
                            correlationId,
                            eventConsumer
                    )
            );
            if (!accumulator.isCompleted()) {
                throw new IllegalStateException("模型流未正常结束");
            }
            completionCallback.run();
            scheduleMemoryExtraction(context, accumulator, correlationId);
        } catch (Throwable error) {
            if (!Thread.currentThread().isInterrupted()) {
                errorCallback.accept(error);
            }
        } finally {
            pendingToolApprovals.entrySet().removeIf(
                    entry -> entry.getValue().taskId().equals(
                            context.getTaskId()
                    )
            );
        }
    }

    private void scheduleMemoryExtraction(
            ConversationRunContext context,
            ConversationStreamAccumulator accumulator,
            String correlationId
    ) {
        try {
            executorService.submit(() -> {
                try {
                    memoryExtractionCoordinator.extractAndStore(
                            context.getConversationId(),
                            context.getCurrentUserMessageId(),
                            context.getCurrentUserContent(),
                            accumulator.getContent(),
                            context.getMemoryExtractionContext(),
                            correlationId
                    );
                } catch (RuntimeException error) {
                    // 记忆是回答完成后的增强能力，失败不能反向破坏已完成的会话。
                    LOGGER.warn("异步记忆提取失败", error);
                }
            });
        } catch (RuntimeException error) {
            LOGGER.warn("无法调度异步记忆提取", error);
        }
    }

    private void handleStreamEvent(
            ConversationRunContext context,
            ConversationStreamAccumulator accumulator,
            ChatStreamEvent event,
            String correlationId,
            Consumer<ChatStreamEvent> eventConsumer
    ) {
        if (event.getType() == ChatStreamEventType.TOOL_APPROVAL_REQUESTED) {
            String approvalId = requireText(
                    event.getApprovalId(),
                    "工具审批 ID"
            );
            PendingToolApproval previous = pendingToolApprovals.putIfAbsent(
                    approvalId,
                    new PendingToolApproval(context.getTaskId(), correlationId)
            );
            if (previous != null) {
                throw new IllegalStateException("工具审批 ID 重复");
            }
        } else if (
                event.getType() == ChatStreamEventType.TOOL_APPROVAL_RESOLVED
        ) {
            pendingToolApprovals.remove(event.getApprovalId());
        }
        accumulator.accept(event);
        if (event.getType() == ChatStreamEventType.COMPLETED) {
            persistenceService.persistAssistant(context, accumulator);
        }
        eventConsumer.accept(event);
    }

    private String requireText(String value, String label) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(label + "不能为空");
        }
        return value.trim();
    }
}
