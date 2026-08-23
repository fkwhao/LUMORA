package com.lumora.core.conversation.application.service;

import com.lumora.core.conversation.application.support.ConversationRunEventStreamRegistry;
import com.lumora.core.conversation.application.support.ConversationRunEventJournal;
import com.lumora.core.conversation.application.support.ConversationRunStore;
import com.lumora.core.conversation.application.support.ConversationInputStore;
import com.lumora.core.conversation.application.support.GitRunChangeService;
import com.lumora.core.conversation.api.dto.response.ConversationRunChangesResponse;
import com.lumora.core.conversation.domain.entity.ConversationInput;
import com.lumora.core.conversation.domain.entity.ConversationRun;
import com.lumora.core.conversation.domain.model.ChatStreamEvent;
import com.lumora.core.conversation.domain.model.ChatStreamEventType;
import com.lumora.core.conversation.domain.model.ConversationRunStatus;
import com.lumora.core.conversation.domain.model.ConversationRunTrigger;
import com.lumora.core.conversation.domain.model.ConversationInputStatus;
import com.lumora.core.conversation.domain.model.ConversationInputTarget;
import com.lumora.core.conversation.domain.model.MessageAttachment;
import com.lumora.core.conversation.application.support.MessageAttachmentJson;
import com.lumora.core.shared.infrastructure.git.GitWorkspaceMutationGate;
import com.lumora.core.task.application.service.TaskService;
import com.lumora.core.task.application.support.TaskWorktreeService;
import com.lumora.core.task.domain.entity.AgentTask;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
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
 * Different tasks share a bounded run pool; each task keeps one active run.
 */
@Service
public class ConversationRunCoordinator {

    private static final Logger LOGGER = LoggerFactory.getLogger(
            ConversationRunCoordinator.class
    );

    private final ConversationService conversationService;
    private final ConversationRunStore runStore;
    private final ConversationInputStore inputStore;
    private final ConversationRunEventStreamRegistry eventStreams;
    private final ConversationRunEventJournal eventJournal;
    private final TaskService taskService;
    private final GitRunChangeService gitRunChangeService;
    private final TaskWorktreeService taskWorktreeService;
    private final GitWorkspaceMutationGate mutationGate;
    private final Clock clock;
    private final int maxConcurrentRuns;
    private final ArrayDeque<String> queuedRunIds = new ArrayDeque<>();
    private final Set<String> executingRunIds = new HashSet<>();
    private final Set<String> pausedTurnRunIds = new HashSet<>();

    @Autowired
    public ConversationRunCoordinator(
            ConversationService conversationService,
            ConversationRunStore runStore,
            ConversationInputStore inputStore,
            ConversationRunEventStreamRegistry eventStreams,
            ConversationRunEventJournal eventJournal,
            TaskService taskService,
            GitRunChangeService gitRunChangeService,
            TaskWorktreeService taskWorktreeService,
            GitWorkspaceMutationGate mutationGate,
            Clock clock,
            @Value("${lumora.runs.max-concurrent:3}") int maxConcurrentRuns
    ) {
        this.conversationService = conversationService;
        this.runStore = runStore;
        this.inputStore = inputStore;
        this.eventStreams = eventStreams;
        this.eventJournal = eventJournal;
        this.taskService = taskService;
        this.gitRunChangeService = gitRunChangeService;
        this.taskWorktreeService = taskWorktreeService;
        this.mutationGate = mutationGate;
        this.clock = clock;
        if (maxConcurrentRuns < 1) {
            throw new IllegalArgumentException(
                    "lumora.runs.max-concurrent 必须大于 0"
            );
        }
        this.maxConcurrentRuns = maxConcurrentRuns;
    }

    /** Test-compatible constructor; production injects the shared gate. */
    public ConversationRunCoordinator(
            ConversationService conversationService,
            ConversationRunStore runStore,
            ConversationInputStore inputStore,
            ConversationRunEventStreamRegistry eventStreams,
            ConversationRunEventJournal eventJournal,
            TaskService taskService,
            GitRunChangeService gitRunChangeService,
            TaskWorktreeService taskWorktreeService,
            Clock clock,
            int maxConcurrentRuns
    ) {
        this(
                conversationService, runStore, inputStore, eventStreams,
                eventJournal, taskService, gitRunChangeService,
                taskWorktreeService, new GitWorkspaceMutationGate(), clock,
                maxConcurrentRuns
        );
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
        return startMessage(taskId, content, List.of(), model,
                reasoningEffort, workspacePath, permissionMode, correlationId);
    }

    public ConversationRun startMessage(
            String taskId,
            String content,
            List<MessageAttachment> attachments,
            String model,
            String reasoningEffort,
            String workspacePath,
            String permissionMode,
            String correlationId
    ) {
        return createAndEnqueue(
                taskId, ConversationRunTrigger.MESSAGE, null, content,
                attachments,
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
        return startRegeneration(taskId, messageId, content, List.of(), model,
                reasoningEffort, workspacePath, permissionMode, correlationId);
    }

    public ConversationRun startRegeneration(
            String taskId,
            String messageId,
            String content,
            List<MessageAttachment> attachments,
            String model,
            String reasoningEffort,
            String workspacePath,
            String permissionMode,
            String correlationId
    ) {
        return createAndEnqueue(
                taskId, ConversationRunTrigger.REGENERATE, messageId, content,
                attachments,
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

    public ConversationRunChangesResponse changes(
            String taskId,
            String runId
    ) {
        get(taskId, runId);
        return gitRunChangeService.changes(taskId, runId);
    }

    public synchronized ConversationRunChangesResponse revert(
            String taskId,
            String runId
    ) {
        return mutationGate.execute(() -> {
            ConversationRun run = get(taskId, runId);
            if (!run.getStatus().isTerminal()) {
                throw new IllegalStateException("只有已结束的运行可以撤回");
            }
            if (runStore.findActiveForTask(taskId) != null) {
                throw new IllegalStateException("当前任务仍有活动运行，不能撤回");
            }
            conversationService.assertRunMessagesRevertible(taskId, runId);
            ConversationRunChangesResponse result =
                    gitRunChangeService.revert(taskId, runId);
            taskWorktreeService.onRunReverted(run);
            conversationService.revertRunMessages(taskId, runId);
            return result;
        });
    }

    public synchronized List<ConversationInput> listInputs(String taskId) {
        taskService.getTask(taskId);
        return List.copyOf(inputStore.listOpenForTask(taskId));
    }

    public synchronized ConversationInput enqueueInput(
            String taskId,
            String content,
            ConversationInputTarget target,
            String model,
            String reasoningEffort,
            String workspacePath,
            String permissionMode,
            Long position
    ) {
        return enqueueInput(taskId, content, List.of(), target, model,
                reasoningEffort, workspacePath, permissionMode, position);
    }

    public synchronized ConversationInput enqueueInput(
            String taskId,
            String content,
            List<MessageAttachment> attachments,
            ConversationInputTarget target,
            String model,
            String reasoningEffort,
            String workspacePath,
            String permissionMode,
            Long position
    ) {
        taskService.getTask(taskId);
        String normalizedContent = requireText(content, "消息内容");
        if (target == null) {
            throw new IllegalArgumentException("队列目标不能为空");
        }
        ConversationRun active = runStore.findActiveForTask(taskId);
        if (target == ConversationInputTarget.NEXT_STEP && active == null) {
            throw new IllegalStateException("当前没有可引导的活动运行");
        }
        List<MessageAttachment> normalizedAttachments =
                MessageAttachment.normalize(attachments);
        if (target == ConversationInputTarget.NEXT_STEP
                && !normalizedAttachments.isEmpty()) {
            throw new IllegalArgumentException("带附件的问题只能排到下一轮");
        }
        Instant now = clock.instant();
        ConversationInput input = new ConversationInput();
        input.setInputId(UUID.randomUUID().toString());
        input.setTaskId(taskId);
        input.setRunId(target == ConversationInputTarget.NEXT_STEP
                ? active.getRunId() : null);
        input.setTarget(target);
        input.setStatus(ConversationInputStatus.PENDING);
        input.setContent(normalizedContent);
        input.setAttachmentsJson(MessageAttachmentJson.encode(
                normalizedAttachments
        ));
        input.setModel(valueOrEmpty(model));
        input.setReasoningEffort(valueOrEmpty(reasoningEffort));
        input.setWorkspacePath(resolveWorkspacePath(taskId, workspacePath));
        input.setPermissionMode(valueOrDefault(
                permissionMode, "request_approval"
        ));
        input.setPosition(position == null
                ? inputStore.nextPosition(taskId) : position);
        input.setCreatedAt(now);
        input.setUpdatedAt(now);
        inputStore.insert(input);

        if (target == ConversationInputTarget.NEXT_STEP) {
            deliverSteer(input, active);
        } else if (active == null) {
            enqueueNextTurn(taskId);
            drainQueue();
        }
        return inputStore.requireForTask(taskId, input.getInputId());
    }

    public synchronized ConversationInput updateInput(
            String taskId,
            String inputId,
            String content,
            ConversationInputTarget target,
            String model,
            String reasoningEffort,
            String workspacePath,
            String permissionMode,
            Long position
    ) {
        return updateInput(taskId, inputId, content, null, target, model,
                reasoningEffort, workspacePath, permissionMode, position);
    }

    public synchronized ConversationInput updateInput(
            String taskId,
            String inputId,
            String content,
            List<MessageAttachment> attachments,
            ConversationInputTarget target,
            String model,
            String reasoningEffort,
            String workspacePath,
            String permissionMode,
            Long position
    ) {
        taskService.getTask(taskId);
        ConversationInput input = inputStore.requireForTask(taskId, inputId);
        if (!input.getStatus().isEditable()) {
            throw new IllegalStateException("队列内容已被处理，不能再编辑");
        }
        ConversationInputTarget nextTarget = target == null
                ? input.getTarget() : target;
        ConversationRun active = runStore.findActiveForTask(taskId);
        if (nextTarget == ConversationInputTarget.NEXT_STEP
                && active == null) {
            throw new IllegalStateException("当前没有可引导的活动运行");
        }
        List<MessageAttachment> nextAttachments = attachments == null
                ? MessageAttachmentJson.decode(input.getAttachmentsJson())
                : MessageAttachment.normalize(attachments);
        if (nextTarget == ConversationInputTarget.NEXT_STEP
                && !nextAttachments.isEmpty()) {
            throw new IllegalArgumentException("带附件的问题只能排到下一轮");
        }
        String nextContent = content == null
                ? input.getContent() : requireText(content, "消息内容");
        boolean wasDelivered = input.getStatus()
                == ConversationInputStatus.DELIVERED;
        boolean remainsSameSteer = wasDelivered
                && input.getTarget() == ConversationInputTarget.NEXT_STEP
                && nextTarget == ConversationInputTarget.NEXT_STEP
                && active != null
                && active.getRunId().equals(input.getRunId());

        if (wasDelivered && !remainsSameSteer
                && !conversationService.removeSteer(taskId, inputId)) {
            inputStore.markStatus(input, ConversationInputStatus.CLAIMED);
            throw new IllegalStateException("引导内容已被 Agent 认领");
        }
        if (remainsSameSteer && !nextContent.equals(input.getContent())
                && !conversationService.replaceSteer(
                taskId, inputId, nextContent
        )) {
            inputStore.markStatus(input, ConversationInputStatus.CLAIMED);
            throw new IllegalStateException("引导内容已被 Agent 认领");
        }

        input.setContent(nextContent);
        input.setAttachmentsJson(MessageAttachmentJson.encode(nextAttachments));
        input.setTarget(nextTarget);
        input.setRunId(nextTarget == ConversationInputTarget.NEXT_STEP
                ? active.getRunId() : null);
        input.setStatus(remainsSameSteer
                ? ConversationInputStatus.DELIVERED
                : ConversationInputStatus.PENDING);
        if (model != null) input.setModel(valueOrEmpty(model));
        if (reasoningEffort != null) {
            input.setReasoningEffort(valueOrEmpty(reasoningEffort));
        }
        if (workspacePath != null) {
            input.setWorkspacePath(resolveWorkspacePath(
                    taskId, workspacePath
            ));
        }
        if (permissionMode != null) {
            input.setPermissionMode(valueOrDefault(
                    permissionMode, "request_approval"
            ));
        }
        if (position != null) input.setPosition(position);
        input = inputStore.saveIfOpen(input);

        if (nextTarget == ConversationInputTarget.NEXT_STEP
                && input.getStatus() == ConversationInputStatus.PENDING) {
            deliverSteer(input, active);
        } else if (nextTarget == ConversationInputTarget.NEXT_TURN
                && active == null) {
            enqueueNextTurn(taskId);
            drainQueue();
        }
        return inputStore.requireForTask(taskId, inputId);
    }

    public synchronized void deleteInput(String taskId, String inputId) {
        taskService.getTask(taskId);
        ConversationInput input = inputStore.requireForTask(taskId, inputId);
        if (!input.getStatus().isEditable()) {
            return;
        }
        if (input.getStatus() == ConversationInputStatus.DELIVERED
                && !conversationService.removeSteer(taskId, inputId)) {
            inputStore.markStatus(input, ConversationInputStatus.CLAIMED);
            throw new IllegalStateException("引导内容已被 Agent 认领");
        }
        inputStore.markStatus(input, ConversationInputStatus.CANCELLED);
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
                // Pause is idempotent at the API boundary. The renderer may
                // issue the request just as the final stream event settles.
                return run;
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
            eventJournal.flush(runId);
            inputStore.cancelOpenForTask(taskId);
            run = mutationGate.execute(() -> {
                ConversationRun cancelled = runStore.updateStatus(
                        runId, ConversationRunStatus.CANCELLED, ""
                );
                gitRunChangeService.captureTerminal(cancelled);
                taskWorktreeService.onRunTerminal(cancelled);
                return cancelled;
            });
            publishLifecycle(runId, "任务已取消", "CANCELLED");
            eventStreams.complete(runId);
            releaseExecution(runId);
            drainQueue();
            return run;
        }
    }

    @EventListener(ApplicationReadyEvent.class)
    public synchronized void recoverRunsAfterRestart() {
        taskWorktreeService.recoverAfterRestart(
                runStore.listActive().stream()
                        .map(ConversationRun::getTaskId)
                        .collect(java.util.stream.Collectors.toSet())
        );
        for (ConversationRun run : runStore.listRecoverable()) {
            inputStore.resetDeliveredForRun(run.getRunId());
            recoverAsPaused(
                    run,
                    currentTurnEvents(run),
                    "应用重启后已安全暂停，等待继续"
            );
        }
        for (ConversationRun run : runStore.listRepairablePauseFailures()) {
            inputStore.resetDeliveredForRun(run.getRunId());
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
        for (String taskId : inputStore.listTaskIdsWithPendingNextTurns()) {
            if (runStore.findActiveForTask(taskId) == null) {
                enqueueNextTurn(taskId);
            }
        }
        drainQueue();
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
            List<MessageAttachment> attachments,
            String model,
            String reasoningEffort,
            String workspacePath,
            String permissionMode,
            String correlationId
    ) {
        return mutationGate.execute(() -> createAndEnqueueUnderGate(
                taskId, trigger, sourceMessageId, content, attachments,
                model, reasoningEffort, workspacePath, permissionMode,
                correlationId
        ));
    }

    private ConversationRun createAndEnqueueUnderGate(
            String taskId,
            ConversationRunTrigger trigger,
            String sourceMessageId,
            String content,
            List<MessageAttachment> attachments,
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
        run.setAttachmentsJson(MessageAttachmentJson.encode(attachments));
        run.setModel(valueOrEmpty(model));
        run.setReasoningEffort(valueOrEmpty(reasoningEffort));
        run.setWorkspacePath(resolveWorkspacePath(taskId, workspacePath));
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

    private void deliverPendingSteers(ConversationRun run) {
        for (ConversationInput input : inputStore.listOpenForRun(
                run.getRunId()
        )) {
            if (input.getStatus() == ConversationInputStatus.PENDING) {
                deliverSteer(input, run);
            }
        }
    }

    private void deliverSteer(
            ConversationInput input,
            ConversationRun active
    ) {
        if (active == null
                || !active.getRunId().equals(input.getRunId())) {
            moveToNextTurn(input);
            return;
        }
        if (active.getStatus() == ConversationRunStatus.PAUSED
                || active.getStatus() == ConversationRunStatus.PAUSING
                || active.getStatus() == ConversationRunStatus.QUEUED) {
            return;
        }
        try {
            if (conversationService.addSteer(
                    active.getTaskId(), input.getInputId(), input.getContent()
            )) {
                inputStore.markDeliveredIfPending(input);
                return;
            }
        } catch (RuntimeException error) {
            LOGGER.warn(
                    "Failed to deliver steer {} for run {}",
                    input.getInputId(), active.getRunId(), error
            );
            return;
        }
        moveToNextTurn(input);
    }

    private void moveToNextTurn(ConversationInput input) {
        input.setRunId(null);
        input.setTarget(ConversationInputTarget.NEXT_TURN);
        input.setStatus(ConversationInputStatus.PENDING);
        inputStore.save(input);
    }

    private void enqueueNextTurn(String taskId) {
        mutationGate.execute(() -> enqueueNextTurnUnderGate(taskId));
    }

    private void enqueueNextTurnUnderGate(String taskId) {
        if (runStore.findActiveForTask(taskId) != null) {
            return;
        }
        ConversationInput input = inputStore.firstPendingNextTurn(taskId);
        if (input == null) {
            return;
        }
        Instant now = clock.instant();
        ConversationRun run = new ConversationRun();
        run.setRunId(UUID.randomUUID().toString());
        run.setTaskId(taskId);
        run.setStatus(ConversationRunStatus.QUEUED);
        run.setTriggerType(ConversationRunTrigger.MESSAGE);
        run.setSourceMessageId("");
        run.setInputContent(input.getContent());
        run.setAttachmentsJson(input.getAttachmentsJson());
        run.setModel(input.getModel());
        run.setReasoningEffort(input.getReasoningEffort());
        run.setWorkspacePath(resolveWorkspacePath(
                taskId, input.getWorkspacePath()
        ));
        run.setPermissionMode(input.getPermissionMode());
        run.setLastEventSequence(0L);
        run.setReplayFromSequence(0L);
        run.setErrorMessage("");
        run.setCreatedAt(now);
        run.setUpdatedAt(now);
        runStore.insert(run);
        input.setRunId(run.getRunId());
        inputStore.markStatus(input, ConversationInputStatus.CLAIMED);
        enqueue(run.getRunId());
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
            try {
                run = mutationGate.execute(() -> bindAndActivateRun(runId));
                if (run.getTriggerType() == ConversationRunTrigger.RESUME) {
                    publishLifecycle(
                            runId, "正在恢复执行现场", "RUNNING"
                    );
                }
                startWorker(runStore.require(runId));
            } catch (RuntimeException error) {
                fail(runId, error);
            }
        }
    }

    private ConversationRun bindAndActivateRun(String runId) {
        ConversationRun run = runStore.require(runId);
        String effectiveWorkspace = taskWorktreeService.acquireForRun(run);
        if (effectiveWorkspace == null || effectiveWorkspace.isBlank()) {
            effectiveWorkspace = run.getWorkspacePath();
        }
        ConversationRun updatedRun = runStore.updateWorkspacePath(
                runId, effectiveWorkspace
        );
        if (updatedRun != null) {
            run = updatedRun;
        } else {
            // Defensive fallback for alternative store adapters.
            run.setWorkspacePath(effectiveWorkspace);
        }
        gitRunChangeService.begin(run);
        ConversationRun running = runStore.updateStatus(
                runId, ConversationRunStatus.RUNNING, ""
        );
        return running == null ? run : running;
    }

    private void startWorker(ConversationRun run) {
        java.util.function.Consumer<ChatStreamEvent> eventConsumer =
                event -> onEvent(run.getRunId(), event);
        Runnable completion = () -> complete(run.getRunId());
        java.util.function.Consumer<Throwable> failure =
                error -> fail(run.getRunId(), error);
        String correlationId = runtimeTurnId(run);
        List<MessageAttachment> attachments = MessageAttachmentJson.decode(
                run.getAttachmentsJson()
        );
        if (run.getTriggerType() == ConversationRunTrigger.REGENERATE) {
            if (attachments.isEmpty()) {
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
            } else {
                conversationService.regenerateMessage(
                        run.getTaskId(),
                        run.getSourceMessageId(),
                        run.getInputContent(),
                        attachments,
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
            deliverPendingSteers(run);
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
            deliverPendingSteers(run);
            return;
        }
        if (attachments.isEmpty()) {
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
        } else {
            conversationService.streamMessage(
                    run.getTaskId(),
                    run.getInputContent(),
                    attachments,
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
        deliverPendingSteers(run);
    }

    private synchronized void onEvent(String runId, ChatStreamEvent event) {
        if (!executingRunIds.contains(runId)) {
            return;
        }
        eventJournal.append(runId, event);
        if (event.getType() == ChatStreamEventType.STEER_CLAIMED) {
            ConversationRun run = runStore.require(runId);
            String inputId = event.getItemId();
            if (inputId != null && !inputId.isBlank()) {
                ConversationInput input = inputStore.requireForTask(
                        run.getTaskId(), inputId
                );
                if (input.getStatus().isEditable()) {
                    inputStore.markStatus(
                            input, ConversationInputStatus.CLAIMED
                    );
                }
            }
        } else if (event.getType() == ChatStreamEventType.PAUSED) {
            pausedTurnRunIds.add(runId);
        } else if (event.getType()
                == ChatStreamEventType.TOOL_APPROVAL_REQUESTED) {
            ConversationRun run = runStore.require(runId);
            if (run.getStatus() == ConversationRunStatus.RUNNING) {
                runStore.updateStatus(
                        runId, ConversationRunStatus.WAITING_APPROVAL, ""
                );
            }
        } else if (event.getType()
                == ChatStreamEventType.TOOL_APPROVAL_RESOLVED) {
            ConversationRun run = runStore.require(runId);
            if (run.getStatus()
                    == ConversationRunStatus.WAITING_APPROVAL) {
                runStore.updateStatus(
                        runId, ConversationRunStatus.RUNNING, ""
                );
            }
        }
    }

    private synchronized void complete(String runId) {
        eventJournal.flush(runId);
        ConversationRun run = runStore.require(runId);
        boolean paused = pausedTurnRunIds.remove(runId);
        if (paused && !run.getStatus().isTerminal()) {
            runStore.updateStatus(runId, ConversationRunStatus.PAUSED, "");
            publishLifecycle(runId, "任务已暂停", "PAUSED");
        } else {
            mutationGate.execute(() -> {
                ConversationRun current = runStore.require(runId);
                if (!current.getStatus().isTerminal()
                        && current.getStatus()
                        != ConversationRunStatus.PAUSED) {
                    inputStore.moveOpenSteersToNextTurn(runId);
                    runStore.updateStatus(
                            runId, ConversationRunStatus.COMPLETED, ""
                    );
                }
                ConversationRun settled = runStore.require(runId);
                if (settled.getStatus().isTerminal()) {
                    gitRunChangeService.captureTerminal(settled);
                    taskWorktreeService.onRunTerminal(settled);
                }
            });
        }
        ConversationRun settled = runStore.require(runId);
        eventStreams.complete(runId);
        releaseExecution(runId);
        if (!paused && runStore.require(runId).getStatus()
                == ConversationRunStatus.COMPLETED) {
            enqueueNextTurn(run.getTaskId());
        }
        drainQueue();
    }

    private synchronized void fail(String runId, Throwable error) {
        eventJournal.flush(runId);
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
        inputStore.moveOpenSteersToNextTurn(runId);
        ChatStreamEvent failed = new ChatStreamEvent(
                ChatStreamEventType.FAILED, "", run.getModel(), null, message
        );
        eventJournal.appendImmediately(runId, failed);
        mutationGate.execute(() -> {
            runStore.updateStatus(
                    runId, ConversationRunStatus.FAILED, message
            );
            ConversationRun failedRun = runStore.require(runId);
            gitRunChangeService.captureTerminal(failedRun);
            taskWorktreeService.onRunTerminal(failedRun);
        });
        eventStreams.complete(runId);
        releaseExecution(runId);
        drainQueue();
    }

    private void publishLifecycle(
            String runId,
            String message,
            String status
    ) {
        eventJournal.flush(runId);
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
        eventJournal.appendImmediately(runId, event);
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

    private String resolveWorkspacePath(
            String taskId,
            String requestedWorkspacePath
    ) {
        if (requestedWorkspacePath != null
                && !requestedWorkspacePath.isBlank()) {
            return requestedWorkspacePath.trim();
        }
        AgentTask task = taskService.getTask(taskId);
        if (task != null && task.getWorkspacePath() != null
                && !task.getWorkspacePath().isBlank()) {
            return task.getWorkspacePath().trim();
        }
        String leasedSource = valueOrEmpty(
                taskWorktreeService.sourceWorkspacePath(taskId)
        );
        if (!leasedSource.isBlank()) return leasedSource;
        return valueOrEmpty(
                runStore.findLatestWorkspacePathForTask(taskId)
        );
    }

    private String valueOrDefault(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private String emptyToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
