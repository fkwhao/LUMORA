package com.lumora.core.conversation.application.service.impl;

import com.lumora.core.conversation.domain.entity.ConversationMessage;
import com.lumora.core.conversation.domain.model.ChatStreamEvent;
import com.lumora.core.conversation.domain.model.ChatStreamEventType;
import com.lumora.core.conversation.domain.model.ContextCompaction;
import com.lumora.core.conversation.application.service.ArtifactService;
import com.lumora.core.conversation.application.service.ConversationService;
import com.lumora.core.conversation.application.model.ConversationRunRequest;
import com.lumora.core.conversation.application.port.ContextCompactionPort;
import com.lumora.core.conversation.application.port.ConversationRuntimePort;
import com.lumora.core.conversation.application.port.ToolApprovalPort;
import com.lumora.core.memory.application.service.MemoryService;
import com.lumora.core.conversation.application.support.ContextCompactionInput;
import com.lumora.core.conversation.application.support.ConversationContextSummaryService;
import com.lumora.core.conversation.application.support.ConversationPersistenceService;
import com.lumora.core.conversation.application.support.ConversationRunContext;
import com.lumora.core.conversation.application.support.ConversationStreamAccumulator;
import com.lumora.core.conversation.application.support.WorkLogEventProjector;
import com.lumora.core.memory.application.support.MemoryExtractionCoordinator;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.FutureTask;
import java.util.function.Consumer;
import java.util.function.Supplier;

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
    private final ConversationRuntimePort conversationRuntimePort;
    private final ContextCompactionPort contextCompactionPort;
    private final ToolApprovalPort toolApprovalPort;
    private final ExecutorService executorService;
    private final MemoryExtractionCoordinator memoryExtractionCoordinator;
    private final ConversationContextSummaryService contextSummaryService;
    private final ArtifactService artifactService;
    private final MemoryService memoryService;
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
    public void activateBranch(String taskId, String messageId) {
        if (activeRuns.containsKey(taskId)) {
            throw new IllegalStateException("生成回复时不能切换分支");
        }
        persistenceService.activateBranch(taskId, messageId);
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
                        normalizedContent,
                        workspacePath
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
                        normalizedContent,
                        workspacePath
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
    public synchronized ContextCompaction compactContext(
            String taskId, String model, String correlationId
    ) {
        if (activeRuns.containsKey(taskId)) {
            throw new IllegalStateException("当前任务正在生成回复");
        }
        ContextCompactionInput input = persistenceService.prepareCompaction(
                taskId
        );
        ContextCompaction result = contextCompactionPort.compactContext(
                input.messages(), input.memorySummary(), taskId,
                input.existingSummary(), model, correlationId
        );
        int throughSequence = result.throughSequence() == null
                ? input.messages().get(input.messages().size() - 1).getSequence()
                : result.throughSequence();
        contextSummaryService.persist(
                input.conversationId(), result.summary(), throughSequence,
                result.beforeTokens(), result.afterTokens()
        );
        Map<String, Object> metadata = Map.of(
                "beforeTokens", result.beforeTokens(),
                "afterTokens", result.afterTokens(),
                "throughSequence", throughSequence,
                "trigger", "manual"
        );
        persistenceService.appendWorkLogEvent(
                taskId,
                new ChatStreamEvent(
                        ChatStreamEventType.CONTEXT_COMPACTED,
                        "已手动压缩上下文",
                        model == null ? "" : model,
                        result.usage(),
                        "",
                        "manual-context-compact-" + correlationId,
                        "", "", "已压缩上下文", Map.of(), "",
                        0L, null, metadata,
                        "", "", "", "", null, "",
                        result.afterTokens()
                )
        );
        return result;
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
            toolApprovalPort.decideToolApproval(
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
            conversationRuntimePort.streamChat(
                    new ConversationRunRequest(
                            context.getModelMessages(),
                            correlationId,
                            model,
                            reasoningEffort,
                            context.getMemorySummary(),
                            workspacePath,
                            permissionMode,
                            context.getTaskId(),
                            context.getConversationSummary(),
                            context.getMemoryCandidates()
                    ),
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
                            context.getProjectScopeId(),
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
        if (event.getType() == ChatStreamEventType.PROGRESS_MESSAGE
                && "memory_retrieval".equals(
                        event.getMetadata().get("category")
                )) {
            memoryService.markUsed(stringList(
                    event.getMetadata().get("memoryIds")
            ));
            return;
        }
        if (event.getType() == ChatStreamEventType.CONTEXT_COMPACTED) {
            Map<String, Object> metadata = event.getMetadata();
            Object summary = metadata.get("summary");
            Object throughSequence = metadata.get("throughSequence");
            if (summary instanceof String text
                    && throughSequence instanceof Number boundary) {
                contextSummaryService.persist(
                        context.getConversationId(), text,
                        boundary.intValue(),
                        number(metadata.get("beforeTokens")),
                        number(metadata.get("afterTokens"))
                );
            }
        }
        if (event.getType() == ChatStreamEventType.TOOL_COMPLETED
                && event.getMetadata().containsKey("artifactId")) {
            artifactService.register(
                    context.getTaskId(), context.getConversationId(), event
            );
        }
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
        eventConsumer.accept(
                event.getType() == ChatStreamEventType.CONTEXT_COMPACTED
                        ? WorkLogEventProjector.project(event)
                        : event
        );
    }

    private static int number(Object value) {
        return value instanceof Number number ? number.intValue() : 0;
    }

    private static List<String> stringList(Object value) {
        if (!(value instanceof List<?> values)) {
            return List.of();
        }
        return values.stream()
                .filter(String.class::isInstance)
                .map(String.class::cast)
                .toList();
    }

    private String requireText(String value, String label) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(label + "不能为空");
        }
        return value.trim();
    }
}
