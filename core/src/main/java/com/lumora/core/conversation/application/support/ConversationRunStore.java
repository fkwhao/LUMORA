package com.lumora.core.conversation.application.support;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lumora.core.conversation.domain.entity.ConversationRun;
import com.lumora.core.conversation.domain.entity.ConversationRunEvent;
import com.lumora.core.conversation.domain.model.ChatStreamEvent;
import com.lumora.core.conversation.domain.model.ConversationRunEventEnvelope;
import com.lumora.core.conversation.domain.model.ConversationRunStatus;
import com.lumora.core.conversation.infrastructure.persistence.ConversationRunEventMapper;
import com.lumora.core.conversation.infrastructure.persistence.ConversationRunMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Instant;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;

/** Transaction boundary for durable Agent run state and replayable events. */
@Service
@RequiredArgsConstructor
public class ConversationRunStore {

    private static final String MESSAGE_SEQUENCE_CONSTRAINT =
            "UNIQUE constraint failed: conversation_message."
                    + "conversation_id, conversation_message.sequence";

    private static final Set<ConversationRunStatus> RECOVERABLE = EnumSet.of(
            ConversationRunStatus.QUEUED,
            ConversationRunStatus.RUNNING,
            ConversationRunStatus.PAUSING,
            ConversationRunStatus.WAITING_APPROVAL
    );

    private final ConversationRunMapper runMapper;
    private final ConversationRunEventMapper eventMapper;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate transactionTemplate;
    private final Clock clock;

    public synchronized ConversationRun insert(ConversationRun run) {
        runMapper.insert(run);
        return run;
    }

    public ConversationRun require(String runId) {
        if (runId == null || runId.isBlank()) {
            throw new IllegalArgumentException("运行 ID 不能为空");
        }
        ConversationRun run = runMapper.selectById(runId);
        if (run == null) {
            throw new IllegalArgumentException("运行不存在: " + runId);
        }
        return run;
    }

    public ConversationRun requireForTask(String taskId, String runId) {
        ConversationRun run = require(runId);
        if (!run.getTaskId().equals(taskId)) {
            throw new IllegalArgumentException("运行不属于当前任务");
        }
        return run;
    }

    public ConversationRun findActiveForTask(String taskId) {
        return runMapper.selectList(
                Wrappers.<ConversationRun>lambdaQuery()
                        .eq(ConversationRun::getTaskId, taskId)
                        .in(ConversationRun::getStatus,
                                ConversationRunStatus.QUEUED,
                                ConversationRunStatus.RUNNING,
                                ConversationRunStatus.PAUSING,
                                ConversationRunStatus.PAUSED,
                                ConversationRunStatus.WAITING_APPROVAL)
                        .orderByDesc(ConversationRun::getUpdatedAt)
        ).stream().findFirst().orElse(null);
    }

    public List<ConversationRun> listRecoverable() {
        return runMapper.selectList(
                Wrappers.<ConversationRun>lambdaQuery()
                        .in(ConversationRun::getStatus, RECOVERABLE)
                        .orderByAsc(ConversationRun::getCreatedAt)
        );
    }

    public List<ConversationRun> listRepairablePauseFailures() {
        return runMapper.selectList(
                Wrappers.<ConversationRun>lambdaQuery()
                        .eq(ConversationRun::getStatus,
                                ConversationRunStatus.FAILED)
                        .like(ConversationRun::getErrorMessage,
                                MESSAGE_SEQUENCE_CONSTRAINT)
                        .orderByAsc(ConversationRun::getCreatedAt)
        );
    }

    public synchronized ConversationRun updateStatus(
            String runId,
            ConversationRunStatus status,
            String errorMessage
    ) {
        ConversationRun run = require(runId);
        Instant now = clock.instant();
        run.setStatus(status);
        run.setUpdatedAt(now);
        run.setErrorMessage(errorMessage == null ? "" : errorMessage);
        if (status == ConversationRunStatus.RUNNING
                && run.getStartedAt() == null) {
            run.setStartedAt(now);
        }
        if (status.isTerminal()) {
            run.setCompletedAt(now);
        }
        runMapper.updateById(run);
        return run;
    }

    public synchronized ConversationRun prepareResume(String runId) {
        ConversationRun run = require(runId);
        run.setReplayFromSequence(run.getLastEventSequence());
        if (run.getStartedAt() != null) {
            run.setTriggerType(
                    com.lumora.core.conversation.domain.model.ConversationRunTrigger.RESUME
            );
        }
        run.setStatus(ConversationRunStatus.QUEUED);
        run.setErrorMessage("");
        run.setUpdatedAt(clock.instant());
        run.setCompletedAt(null);
        runMapper.updateById(run);
        return run;
    }

    public synchronized ConversationRun markRecoveredPaused(String runId) {
        ConversationRun run = require(runId);
        if (run.getStartedAt() != null) {
            run.setTriggerType(
                    com.lumora.core.conversation.domain.model.ConversationRunTrigger.RESUME
            );
        }
        run.setStatus(ConversationRunStatus.PAUSED);
        run.setErrorMessage("");
        run.setUpdatedAt(clock.instant());
        run.setCompletedAt(null);
        runMapper.updateById(run);
        return run;
    }

    public synchronized ConversationRunEventEnvelope appendEvent(
            String runId,
            ChatStreamEvent event
    ) {
        ConversationRunEventEnvelope envelope = transactionTemplate.execute(
                status -> appendEventInTransaction(runId, event)
        );
        if (envelope == null) {
            throw new IllegalStateException("无法保存运行事件");
        }
        return envelope;
    }

    private ConversationRunEventEnvelope appendEventInTransaction(
            String runId,
            ChatStreamEvent event
    ) {
        ConversationRun run = require(runId);
        long sequence = run.getLastEventSequence() + 1L;
        Instant now = clock.instant();
        ConversationRunEvent stored = new ConversationRunEvent();
        stored.setEventId(runId + ":" + sequence);
        stored.setRunId(runId);
        stored.setSequence(sequence);
        stored.setEventJson(writeEvent(event));
        stored.setOccurredAt(now);
        eventMapper.insert(stored);
        run.setLastEventSequence(sequence);
        run.setUpdatedAt(now);
        runMapper.updateById(run);
        return new ConversationRunEventEnvelope(
                runId, sequence, event, now
        );
    }

    public List<ConversationRunEvent> listEventsAfter(
            String runId,
            long afterSequence
    ) {
        require(runId);
        return eventMapper.selectList(
                Wrappers.<ConversationRunEvent>lambdaQuery()
                        .eq(ConversationRunEvent::getRunId, runId)
                        .gt(ConversationRunEvent::getSequence,
                                Math.max(0L, afterSequence))
                        .orderByAsc(ConversationRunEvent::getSequence)
        );
    }

    public JsonNode readEventJson(ConversationRunEvent event) {
        try {
            return objectMapper.readTree(event.getEventJson());
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("运行事件数据损坏", error);
        }
    }

    public List<ChatStreamEvent> listChatEventsAfter(
            String runId,
            long afterSequence
    ) {
        return listEventsAfter(runId, afterSequence).stream()
                .map(this::readChatEvent)
                .toList();
    }

    private ChatStreamEvent readChatEvent(ConversationRunEvent event) {
        try {
            return objectMapper.readValue(
                    event.getEventJson(), ChatStreamEvent.class
            );
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("运行事件数据损坏", error);
        }
    }

    private String writeEvent(ChatStreamEvent event) {
        try {
            return objectMapper.writeValueAsString(event);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("无法保存运行事件", error);
        }
    }
}
