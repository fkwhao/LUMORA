package com.lumora.core.conversation.application.service.impl;

import com.lumora.core.conversation.domain.entity.ConversationMessage;
import com.lumora.core.conversation.domain.model.ChatStreamEvent;
import com.lumora.core.conversation.domain.model.ChatStreamEventType;
import com.lumora.core.conversation.domain.model.ContextCompaction;
import com.lumora.core.conversation.domain.model.MessageAttachment;
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
import com.lumora.core.memory.application.model.MemoryExtractionOutcome;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
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
    private static final long CANCEL_SETTLE_TIMEOUT_SECONDS = 10L;

    private final ConversationPersistenceService persistenceService;
    private final ConversationRuntimePort conversationRuntimePort;
    private final ContextCompactionPort contextCompactionPort;
    private final ToolApprovalPort toolApprovalPort;
    private final ExecutorService executorService;
    private final MemoryExtractionCoordinator memoryExtractionCoordinator;
    private final ConversationContextSummaryService contextSummaryService;
    private final ArtifactService artifactService;
    private final MemoryService memoryService;
    private final ConcurrentHashMap<String, ActiveRun> activeRuns =
            new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, PendingToolApproval>
            pendingToolApprovals = new ConcurrentHashMap<>();

    private record PendingToolApproval(String taskId, String correlationId) {
    }

    private static final class ActiveRun {
        private final CountDownLatch terminated = new CountDownLatch(1);
        private final String correlationId;
        private FutureTask<Void> task;
        private volatile boolean pauseRequested;
        private volatile boolean runtimeStarted;
        private volatile boolean pauseForwarded;

        private ActiveRun(String correlationId) {
            this.correlationId = correlationId;
        }

        private void attach(FutureTask<Void> task) {
            this.task = task;
        }

        private boolean cancel() {
            return task != null && task.cancel(true);
        }

        private void requestPause() {
            pauseRequested = true;
        }

        private boolean isPauseRequested() {
            return pauseRequested;
        }

        private void markRuntimeStarted() {
            runtimeStarted = true;
        }

        private boolean isRuntimeStarted() {
            return runtimeStarted;
        }

        private boolean needsPauseForwarding() {
            return pauseRequested && !pauseForwarded;
        }

        private void markPauseForwarded() {
            pauseForwarded = true;
        }

        private boolean awaitTermination() throws InterruptedException {
            return terminated.await(
                    CANCEL_SETTLE_TIMEOUT_SECONDS,
                    TimeUnit.SECONDS
            );
        }

        private void markTerminated() {
            terminated.countDown();
        }
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
    public void assertRunMessagesRevertible(String taskId, String runId) {
        if (activeRuns.containsKey(taskId)) {
            throw new IllegalStateException("任务运行期间不能撤回历史执行");
        }
        persistenceService.assertRunMessagesRevertible(taskId, runId);
    }

    @Override
    public void revertRunMessages(String taskId, String runId) {
        persistenceService.revertRunMessages(taskId, runId);
    }

    @Override
    public void streamMessage(
            String taskId,
            String content,
            List<MessageAttachment> attachments,
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
        List<MessageAttachment> normalizedAttachments =
                MessageAttachment.normalize(attachments);
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
                        normalizedAttachments,
                        workspacePath,
                        logicalRunId(correlationId)
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
            List<MessageAttachment> attachments,
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
        List<MessageAttachment> normalizedAttachments =
                MessageAttachment.normalize(attachments);
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
                        normalizedAttachments,
                        workspacePath,
                        logicalRunId(correlationId)
                ),
                eventConsumer,
                completionCallback,
                errorCallback
        );
    }

    @Override
    public void continueMessage(
            String taskId,
            String model,
            String reasoningEffort,
            String workspacePath,
            String permissionMode,
            String correlationId,
            Consumer<ChatStreamEvent> eventConsumer,
            Runnable completionCallback,
            Consumer<Throwable> errorCallback
    ) {
        startGeneration(
                taskId,
                requireText(correlationId, "关联 ID"),
                model,
                reasoningEffort,
                workspacePath,
                permissionMode,
                () -> persistenceService.prepareContinuation(
                        taskId, workspacePath, logicalRunId(correlationId)
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

        ActiveRun activeRun = new ActiveRun(correlationId);
        AtomicReference<Runnable> terminalCallback = new AtomicReference<>();
        try {
            FutureTask<Void> run = new FutureTask<>(() -> {
                try {
                    ConversationRunContext context = contextSupplier.get();
                    if (activeRun.isPauseRequested()) {
                        handleStreamEvent(
                                context,
                                new ConversationStreamAccumulator(),
                                new ChatStreamEvent(
                                        ChatStreamEventType.PAUSED,
                                        "",
                                        model == null ? "" : model,
                                        null,
                                        ""
                                ),
                                correlationId,
                                eventConsumer
                        );
                        terminalCallback.compareAndSet(
                                null, completionCallback
                        );
                        return null;
                    }
                    activeRun.markRuntimeStarted();
                    Consumer<ChatStreamEvent> pauseAwareConsumer = event -> {
                        if (activeRun.needsPauseForwarding()
                                && conversationRuntimePort.pauseChat(
                                correlationId, correlationId
                        )) {
                            activeRun.markPauseForwarded();
                        }
                        eventConsumer.accept(event);
                    };
                    executeStream(
                            context,
                            correlationId,
                            model,
                            reasoningEffort,
                            workspacePath,
                            permissionMode,
                            pauseAwareConsumer,
                            () -> terminalCallback.compareAndSet(
                                    null, completionCallback
                            ),
                            error -> terminalCallback.compareAndSet(
                                    null, () -> errorCallback.accept(error)
                            )
                    );
                } catch (Throwable error) {
                    terminalCallback.compareAndSet(
                            null, () -> errorCallback.accept(error)
                    );
                }
                return null;
            }) {
                @Override
                public void run() {
                    try {
                        super.run();
                    } finally {
                        activeRuns.remove(taskId, activeRun);
                        activeRun.markTerminated();
                        Runnable callback = terminalCallback.get();
                        if (callback != null) {
                            callback.run();
                        }
                    }
                }
            };
            activeRun.attach(run);
            activeRuns.put(taskId, activeRun);
            executorService.execute(run);
        } catch (RuntimeException error) {
            ActiveRun removed = activeRuns.remove(taskId);
            if (removed != null) {
                removed.markTerminated();
            }
            throw error;
        }
    }

    @Override
    public synchronized boolean cancelGeneration(String taskId) {
        ActiveRun run = activeRuns.get(taskId);
        pendingToolApprovals.entrySet().removeIf(
                entry -> entry.getValue().taskId().equals(taskId)
        );
        if (run == null || !run.cancel()) {
            return false;
        }
        try {
            if (!run.awaitTermination()) {
                LOGGER.warn(
                        "Timed out waiting for cancelled conversation run {}",
                        taskId
                );
            }
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            LOGGER.warn(
                    "Interrupted while waiting for conversation run {} to stop",
                    taskId
            );
        }
        return true;
    }

    @Override
    public synchronized boolean pauseGeneration(String taskId) {
        ActiveRun run = activeRuns.get(taskId);
        if (run == null) {
            return false;
        }
        run.requestPause();
        if (run.isRuntimeStarted()) {
            if (conversationRuntimePort.pauseChat(
                    run.correlationId, run.correlationId
            )) {
                run.markPauseForwarded();
            }
        }
        return true;
    }

    @Override
    public synchronized boolean addSteer(
            String taskId, String inputId, String content
    ) {
        ActiveRun run = activeRuns.get(taskId);
        return run != null && conversationRuntimePort.addSteer(
                run.correlationId, requireText(inputId, "队列内容 ID"),
                requireText(content, "引导内容"), run.correlationId
        );
    }

    @Override
    public synchronized boolean replaceSteer(
            String taskId, String inputId, String content
    ) {
        ActiveRun run = activeRuns.get(taskId);
        return run != null && conversationRuntimePort.replaceSteer(
                run.correlationId, requireText(inputId, "队列内容 ID"),
                requireText(content, "引导内容"), run.correlationId
        );
    }

    @Override
    public synchronized boolean removeSteer(String taskId, String inputId) {
        ActiveRun run = activeRuns.get(taskId);
        return run != null && conversationRuntimePort.removeSteer(
                run.correlationId, requireText(inputId, "队列内容 ID"),
                run.correlationId
        );
    }

    @Override
    public void sealRecoveredTurn(
            String taskId,
            String runtimeTurnId,
            List<ChatStreamEvent> events
    ) {
        persistenceService.persistRecoveredTurn(
                taskId, runtimeTurnId, List.copyOf(events)
        );
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
            if (accumulator.isPaused()) {
                completionCallback.run();
                return;
            }
            if (!accumulator.isCompleted()) {
                throw new IllegalStateException("模型流未正常结束");
            }
            completionCallback.run();
            scheduleMemoryExtraction(context, accumulator, correlationId);
        } catch (Throwable error) {
            if (!accumulator.isCompleted()
                    && !accumulator.isPaused()
                    && accumulator.hasPersistableResult()) {
                try {
                    persistenceService.persistFailedUsage(
                            context, accumulator
                    );
                } catch (RuntimeException persistenceError) {
                    LOGGER.warn(
                            "Failed to persist usage from an incomplete model run",
                            persistenceError
                    );
                }
            }
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
                    MemoryExtractionOutcome outcome =
                            memoryExtractionCoordinator.extractStoreAndReport(
                            context.getConversationId(),
                            context.getProjectScopeId(),
                            context.getCurrentUserMessageId(),
                            context.getCurrentUserContent(),
                            accumulator.getContent(),
                            context.getMemoryExtractionContext(),
                            correlationId
                    );
                    if (outcome != null) {
                        persistenceService.persistSupplementalUsage(
                                context,
                                outcome.usage(),
                                outcome.model()
                        );
                    }
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
        if (isTerminalEvent(event) && accumulator.isTerminal()) {
            LOGGER.debug(
                    "Ignoring duplicate terminal event {} for run {}",
                    event.getType(), correlationId
            );
            return;
        }
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
        if (event.getType() == ChatStreamEventType.STEER_CLAIMED) {
            persistenceService.persistSteerMessage(
                    context, event.getDelta()
            );
        }
        accumulator.accept(event);
        if (event.getType() == ChatStreamEventType.COMPLETED) {
            persistenceService.persistAssistant(context, accumulator);
        } else if (event.getType() == ChatStreamEventType.PAUSED) {
            persistenceService.persistPausedTurn(
                    context, accumulator, correlationId
            );
        }
        eventConsumer.accept(
                event.getType() == ChatStreamEventType.CONTEXT_COMPACTED
                        ? WorkLogEventProjector.project(event)
                        : event
        );
    }

    private static boolean isTerminalEvent(ChatStreamEvent event) {
        return event.getType() == ChatStreamEventType.COMPLETED
                || event.getType() == ChatStreamEventType.PAUSED;
    }

    private static String logicalRunId(String runtimeTurnId) {
        int separator = runtimeTurnId.indexOf(':');
        return separator < 0
                ? runtimeTurnId
                : runtimeTurnId.substring(0, separator);
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
