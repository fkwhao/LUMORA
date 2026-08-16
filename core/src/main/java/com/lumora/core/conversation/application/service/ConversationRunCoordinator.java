package com.lumora.core.conversation.application.service;

import com.lumora.core.conversation.application.support.ConversationRunEventStreamRegistry;
import com.lumora.core.conversation.application.support.ConversationRunStore;
import com.lumora.core.conversation.domain.entity.ConversationRun;
import com.lumora.core.conversation.domain.model.ChatStreamEvent;
import com.lumora.core.conversation.domain.model.ChatStreamEventType;
import com.lumora.core.conversation.domain.model.ConversationRunStatus;
import com.lumora.core.conversation.domain.model.ConversationRunTrigger;
import com.lumora.core.task.application.service.TaskService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Owns logical Agent runs independently of HTTP, IPC, and renderer lifetimes.
 * The configured concurrency is one today; the scheduler itself is N-run safe.
 */
@Service
public class ConversationRunCoordinator {

    private static final Logger LOGGER = LoggerFactory.getLogger(
            ConversationRunCoordinator.class
    );

    private final ConversationService conversationService;
    private final ConversationRunStore runStore;
    private final ConversationRunEventStreamRegistry eventStreams;
    private final TaskService taskService;
    private final Clock clock;
    private final int maxConcurrentRuns;
    private final ArrayDeque<String> queuedRunIds = new ArrayDeque<>();
    private final Set<String> executingRunIds = new HashSet<>();
    private final Set<String> pausedTurnRunIds = new HashSet<>();

    public ConversationRunCoordinator(
            ConversationService conversationService,
            ConversationRunStore runStore,
            ConversationRunEventStreamRegistry eventStreams,
            TaskService taskService,
            Clock clock,
            @Value("${lumora.runs.max-concurrent:1}") int maxConcurrentRuns
    ) {
        this.conversationService = conversationService;
        this.runStore = runStore;
        this.eventStreams = eventStreams;
        this.taskService = taskService;
        this.clock = clock;
        if (maxConcurrentRuns < 1) {
            throw new IllegalArgumentException(
                    "lumora.runs.max-concurrent 必须大于 0"
            );
        }
        this.maxConcurrentRuns = maxConcurrentRuns;
    }

    public ConversationRun startMessage(
            String taskId,
            String content,
            String model,
            String reasoningEffort,
            String workspacePath,
            String permissionMode,
            String correlationId
    ) {
        return createAndEnqueue(
                taskId, ConversationRunTrigger.MESSAGE, null, content,
                model, reasoningEffort, workspacePath, permissionMode,
                correlationId
        );
    }

    public ConversationRun startRegeneration(
            String taskId,
            String messageId,
            String content,
            String model,
            String reasoningEffort,
            String workspacePath,
            String permissionMode,
            String correlationId
    ) {
        return createAndEnqueue(
                taskId, ConversationRunTrigger.REGENERATE, messageId, content,
                model, reasoningEffort, workspacePath, permissionMode,
                correlationId
        );
    }

    public ConversationRun findActive(String taskId) {
        taskService.getTask(taskId);
        return runStore.findActiveForTask(taskId);
    }

    public ConversationRun get(String taskId, String runId) {
        taskService.getTask(taskId);
        return runStore.requireForTask(taskId, runId);
    }

    public ConversationRun pauseActive(String taskId) {
        ConversationRun active = findActive(taskId);
        return active == null ? null : pause(taskId, active.getRunId());
    }

    public ConversationRun pause(String taskId, String runId) {
        ConversationRun run;
        ConversationRunStatus previousStatus;
        boolean pauseWorker;
        synchronized (this) {
            run = runStore.requireForTask(taskId, runId);
            if (run.getStatus() == ConversationRunStatus.PAUSED) {
                return run;
            }
            if (run.getStatus() == ConversationRunStatus.PAUSING) {
                return run;
            }
            if (run.getStatus().isTerminal()) {
                throw new IllegalStateException("已结束的运行不能暂停");
            }
            if (run.getStatus() == ConversationRunStatus.QUEUED) {
                queuedRunIds.remove(runId);
                run = runStore.updateStatus(
                        runId, ConversationRunStatus.PAUSED, ""
                );
                publishLifecycle(runId, "任务已暂停", "PAUSED");
                return run;
            }
            previousStatus = run.getStatus();
            runStore.updateStatus(
                    runId, ConversationRunStatus.PAUSING, ""
            );
            publishLifecycle(runId, "正在安全暂停任务", "PAUSING");
            pauseWorker = executingRunIds.contains(runId);
        }
        if (!pauseWorker) {
            synchronized (this) {
                run = runStore.updateStatus(
                        runId, ConversationRunStatus.PAUSED, ""
                );
                publishLifecycle(runId, "任务已暂停", "PAUSED");
                return run;
            }
        }
        if (conversationService.pauseGeneration(taskId)) {
            return runStore.require(runId);
        }
        synchronized (this) {
            ConversationRun current = runStore.require(runId);
            if (current.getStatus().isTerminal()) {
                return current;
            }
            if (current.getStatus() == ConversationRunStatus.PAUSING) {
                runStore.updateStatus(runId, previousStatus, "");
            }
        }
        throw new IllegalStateException("Agent 运行未能接受暂停请求");
    }

    public synchronized ConversationRun resume(String taskId, String runId) {
        ConversationRun run = runStore.requireForTask(taskId, runId);
        if (run.getStatus() == ConversationRunStatus.QUEUED
                || run.getStatus() == ConversationRunStatus.RUNNING
                || run.getStatus() == ConversationRunStatus.WAITING_APPROVAL) {
            return run;
        }
        if (run.getStatus() != ConversationRunStatus.PAUSED) {
            throw new IllegalStateException("只有已暂停的运行可以继续");
        }
        run = runStore.prepareResume(runId);
        publishLifecycle(runId, "正在继续任务", "QUEUED");
        enqueue(runId);
        drainQueue();
        return runStore.require(runId);
    }

    public ConversationRun cancelActive(String taskId) {
        ConversationRun active = findActive(taskId);
        return active == null ? null : cancel(taskId, active.getRunId());
    }

    public ConversationRun cancel(String taskId, String runId) {
        ConversationRun run;
        boolean cancelWorker;
        synchronized (this) {
            run = runStore.requireForTask(taskId, runId);
            if (run.getStatus() == ConversationRunStatus.CANCELLED) {
                return run;
            }
            if (run.getStatus().isTerminal()) {
                throw new IllegalStateException("已结束的运行不能取消");
            }
            queuedRunIds.remove(runId);
            cancelWorker = executingRunIds.contains(runId);
        }
        if (cancelWorker) {
            conversationService.cancelGeneration(taskId);
        }
        synchronized (this) {
            pausedTurnRunIds.remove(runId);
            run = runStore.updateStatus(
                    runId, ConversationRunStatus.CANCELLED, ""
            );
            publishLifecycle(runId, "任务已取消", "CANCELLED");
            eventStreams.complete(runId);
            releaseExecution(runId);
            drainQueue();
            return run;
        }
    }

    @EventListener(ApplicationReadyEvent.class)
    public synchronized void recoverRunsAfterRestart() {
        for (ConversationRun run : runStore.listRecoverable()) {
            recoverAsPaused(
                    run,
                    currentTurnEvents(run),
                    "应用重启后已安全暂停，等待继续"
            );
        }
        for (ConversationRun run : runStore.listRepairablePauseFailures()) {
            List<ChatStreamEvent> events = currentTurnEvents(run);
            if (events.stream().noneMatch(this::isPausingLifecycleEvent)) {
                continue;
            }
            recoverAsPaused(
                    run,
                    events,
                    "已修复暂停记录并恢复为可继续状态"
            );
        }
    }

    private void recoverAsPaused(
            ConversationRun run,
            List<ChatStreamEvent> events,
            String message
    ) {
        if (run.getStartedAt() != null) {
            try {
                conversationService.sealRecoveredTurn(
                        run.getTaskId(), runtimeTurnId(run), events
                );
            } catch (RuntimeException error) {
                LOGGER.warn(
                        "Failed to seal recovered turn {}",
                        runtimeTurnId(run), error
                );
            }
        }
        runStore.markRecoveredPaused(run.getRunId());
        publishLifecycle(run.getRunId(), message, "PAUSED");
    }

    private List<ChatStreamEvent> currentTurnEvents(
            ConversationRun run
    ) {
        return run.getStartedAt() == null
                ? List.of()
                : runStore.listChatEventsAfter(
                        run.getRunId(), run.getReplayFromSequence()
                );
    }

    private boolean isPausingLifecycleEvent(ChatStreamEvent event) {
        return event.getType() == ChatStreamEventType.PROGRESS_MESSAGE
                && "PAUSING".equals(event.getMetadata().get("runStatus"));
    }

    private synchronized ConversationRun createAndEnqueue(
            String taskId,
            ConversationRunTrigger trigger,
            String sourceMessageId,
            String content,
            String model,
            String reasoningEffort,
            String workspacePath,
            String permissionMode,
            String correlationId
    ) {
        taskService.getTask(taskId);
        if (runStore.findActiveForTask(taskId) != null) {
            throw new IllegalStateException(
                    "当前任务已有活动运行，请先继续或取消"
            );
        }
        String normalizedContent = requireText(content, "消息内容");
        requireText(correlationId, "关联 ID");
        Instant now = clock.instant();
        ConversationRun run = new ConversationRun();
        run.setRunId(UUID.randomUUID().toString());
        run.setTaskId(taskId);
        run.setStatus(ConversationRunStatus.QUEUED);
        run.setTriggerType(trigger);
        run.setSourceMessageId(valueOrEmpty(sourceMessageId));
        run.setInputContent(normalizedContent);
        run.setModel(valueOrEmpty(model));
        run.setReasoningEffort(valueOrEmpty(reasoningEffort));
        run.setWorkspacePath(valueOrEmpty(workspacePath));
        run.setPermissionMode(valueOrEmpty(permissionMode));
        run.setLastEventSequence(0L);
        run.setReplayFromSequence(0L);
        run.setErrorMessage("");
        run.setCreatedAt(now);
        run.setUpdatedAt(now);
        runStore.insert(run);
        enqueue(run.getRunId());
        drainQueue();
        return runStore.require(run.getRunId());
    }

    private void enqueue(String runId) {
        if (!queuedRunIds.contains(runId)) {
            queuedRunIds.addLast(runId);
        }
    }

    private void drainQueue() {
        while (executingRunIds.size() < maxConcurrentRuns
                && !queuedRunIds.isEmpty()) {
            String runId = queuedRunIds.removeFirst();
            ConversationRun run = runStore.require(runId);
            if (run.getStatus() != ConversationRunStatus.QUEUED) {
                continue;
            }
            executingRunIds.add(runId);
            runStore.updateStatus(runId, ConversationRunStatus.RUNNING, "");
            if (run.getTriggerType() == ConversationRunTrigger.RESUME) {
                publishLifecycle(
                        runId, "正在恢复执行现场", "RUNNING"
                );
            }
            try {
                startWorker(runStore.require(runId));
            } catch (RuntimeException error) {
                fail(runId, error);
            }
        }
    }

    private void startWorker(ConversationRun run) {
        java.util.function.Consumer<ChatStreamEvent> eventConsumer =
                event -> onEvent(run.getRunId(), event);
        Runnable completion = () -> complete(run.getRunId());
        java.util.function.Consumer<Throwable> failure =
                error -> fail(run.getRunId(), error);
        String correlationId = runtimeTurnId(run);
        if (run.getTriggerType() == ConversationRunTrigger.REGENERATE) {
            conversationService.regenerateMessage(
                    run.getTaskId(),
                    run.getSourceMessageId(),
                    run.getInputContent(),
                    run.getModel(),
                    emptyToNull(run.getReasoningEffort()),
                    emptyToNull(run.getWorkspacePath()),
                    emptyToNull(run.getPermissionMode()),
                    correlationId,
                    eventConsumer,
                    completion,
                    failure
            );
            return;
        }
        if (run.getTriggerType() == ConversationRunTrigger.RESUME) {
            conversationService.continueMessage(
                    run.getTaskId(),
                    run.getModel(),
                    emptyToNull(run.getReasoningEffort()),
                    emptyToNull(run.getWorkspacePath()),
                    emptyToNull(run.getPermissionMode()),
                    correlationId,
                    eventConsumer,
                    completion,
                    failure
            );
            return;
        }
        conversationService.streamMessage(
                run.getTaskId(),
                run.getInputContent(),
                run.getModel(),
                emptyToNull(run.getReasoningEffort()),
                emptyToNull(run.getWorkspacePath()),
                emptyToNull(run.getPermissionMode()),
                correlationId,
                eventConsumer,
                completion,
                failure
        );
    }

    private synchronized void onEvent(String runId, ChatStreamEvent event) {
        ConversationRun run = runStore.require(runId);
        if (run.getStatus() == ConversationRunStatus.CANCELLED) {
            return;
        }
        eventStreams.publish(runStore.appendEvent(runId, event));
        if (event.getType() == ChatStreamEventType.PAUSED) {
            pausedTurnRunIds.add(runId);
        } else if (event.getType() == ChatStreamEventType.TOOL_APPROVAL_REQUESTED
                && run.getStatus() == ConversationRunStatus.RUNNING) {
            runStore.updateStatus(
                    runId, ConversationRunStatus.WAITING_APPROVAL, ""
            );
        } else if (event.getType()
                == ChatStreamEventType.TOOL_APPROVAL_RESOLVED
                && run.getStatus() == ConversationRunStatus.WAITING_APPROVAL) {
            runStore.updateStatus(
                    runId, ConversationRunStatus.RUNNING, ""
            );
        }
    }

    private synchronized void complete(String runId) {
        ConversationRun run = runStore.require(runId);
        if (pausedTurnRunIds.remove(runId)
                && !run.getStatus().isTerminal()) {
            runStore.updateStatus(runId, ConversationRunStatus.PAUSED, "");
            publishLifecycle(runId, "任务已暂停", "PAUSED");
        } else if (!run.getStatus().isTerminal()
                && run.getStatus() != ConversationRunStatus.PAUSED) {
            runStore.updateStatus(
                    runId, ConversationRunStatus.COMPLETED, ""
            );
        }
        eventStreams.complete(runId);
        releaseExecution(runId);
        drainQueue();
    }

    private synchronized void fail(String runId, Throwable error) {
        ConversationRun run = runStore.require(runId);
        boolean pauseRequested = pausedTurnRunIds.remove(runId)
                || run.getStatus() == ConversationRunStatus.PAUSING;
        if (pauseRequested && !run.getStatus().isTerminal()) {
            try {
                conversationService.sealRecoveredTurn(
                        run.getTaskId(),
                        runtimeTurnId(run),
                        runStore.listChatEventsAfter(
                                runId, run.getReplayFromSequence()
                        )
                );
            } catch (RuntimeException recoveryError) {
                LOGGER.warn(
                        "Failed to seal paused turn {} after stream failure",
                        runtimeTurnId(run), recoveryError
                );
            }
            runStore.updateStatus(
                    runId, ConversationRunStatus.PAUSED, ""
            );
            publishLifecycle(runId, "任务已暂停", "PAUSED");
            eventStreams.complete(runId);
            releaseExecution(runId);
            drainQueue();
            return;
        }
        if (run.getStatus() == ConversationRunStatus.PAUSED
                || run.getStatus() == ConversationRunStatus.CANCELLED) {
            releaseExecution(runId);
            drainQueue();
            return;
        }
        String message = safeMessage(error);
        ChatStreamEvent failed = new ChatStreamEvent(
                ChatStreamEventType.FAILED, "", run.getModel(), null, message
        );
        eventStreams.publish(runStore.appendEvent(runId, failed));
        runStore.updateStatus(
                runId, ConversationRunStatus.FAILED, message
        );
        releaseExecution(runId);
        drainQueue();
    }

    private void publishLifecycle(
            String runId,
            String message,
            String status
    ) {
        ConversationRun run = runStore.require(runId);
        ChatStreamEvent event = new ChatStreamEvent(
                ChatStreamEventType.PROGRESS_MESSAGE,
                message,
                run.getModel(),
                null,
                "",
                "run-lifecycle-" + (run.getLastEventSequence() + 1),
                "",
                "",
                message,
                Map.of(),
                "",
                0L,
                null,
                Map.of("runStatus", status)
        );
        eventStreams.publish(runStore.appendEvent(runId, event));
    }

    private void releaseExecution(String runId) {
        executingRunIds.remove(runId);
    }

    private String safeMessage(Throwable error) {
        String message = error == null ? null : error.getMessage();
        return message == null || message.isBlank()
                ? "Agent 运行失败"
                : message;
    }

    private String runtimeTurnId(ConversationRun run) {
        return run.getRunId() + ":" + run.getReplayFromSequence();
    }

    private String requireText(String value, String label) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(label + "不能为空");
        }
        return value.trim();
    }

    private String valueOrEmpty(String value) {
        return value == null ? "" : value.trim();
    }

    private String emptyToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
