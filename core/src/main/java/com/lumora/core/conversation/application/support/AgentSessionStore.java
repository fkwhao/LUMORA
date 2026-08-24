package com.lumora.core.conversation.application.support;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lumora.core.conversation.domain.entity.AgentActivation;
import com.lumora.core.conversation.domain.entity.AgentCheckpoint;
import com.lumora.core.conversation.domain.entity.AgentInboxMessage;
import com.lumora.core.conversation.domain.entity.AgentSession;
import com.lumora.core.conversation.domain.entity.ConversationRun;
import com.lumora.core.conversation.domain.model.AgentCheckpointSnapshot;
import com.lumora.core.conversation.domain.model.AgentInboxSnapshot;
import com.lumora.core.conversation.domain.model.AgentSessionSnapshot;
import com.lumora.core.conversation.domain.model.ChatStreamEvent;
import com.lumora.core.conversation.domain.model.ChatStreamEventType;
import com.lumora.core.conversation.infrastructure.persistence.AgentActivationMapper;
import com.lumora.core.conversation.infrastructure.persistence.AgentCheckpointMapper;
import com.lumora.core.conversation.infrastructure.persistence.AgentInboxMessageMapper;
import com.lumora.core.conversation.infrastructure.persistence.AgentSessionMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Durable projection and rehydration boundary for continuable child Sessions. */
@Service
@RequiredArgsConstructor
public class AgentSessionStore {

    private static final TypeReference<List<Map<String, Object>>> TRANSCRIPT_TYPE =
            new TypeReference<>() { };

    private final AgentSessionMapper sessionMapper;
    private final AgentInboxMessageMapper inboxMapper;
    private final AgentActivationMapper activationMapper;
    private final AgentCheckpointMapper checkpointMapper;
    private final ObjectMapper objectMapper;

    public void project(
            ConversationRun run,
            ChatStreamEvent event,
            Instant occurredAt
    ) {
        Map<String, Object> metadata = event.getMetadata();
        String sessionId = text(metadata, "sessionId");
        if (sessionId.isBlank()
                || (!"continuable".equals(text(metadata, "sessionMode"))
                && event.getType() != ChatStreamEventType.AGENT_SESSION_CREATED)) {
            return;
        }
        if (event.getType() != ChatStreamEventType.AGENT_SESSION_CREATED
                && sessionMapper.selectById(sessionId) == null) {
            // The Runtime merges root tool events and background Activation
            // events. Durable projection must remain replay-safe even if a
            // dependent event reaches Core before the explicit create event.
            createSession(run, event, metadata, sessionId, occurredAt);
        }
        switch (event.getType()) {
            case AGENT_SESSION_CREATED -> createSession(
                    run, event, metadata, sessionId, occurredAt
            );
            case AGENT_INBOX_ENQUEUED -> enqueue(
                    event, metadata, sessionId, occurredAt
            );
            case AGENT_PEER_MESSAGE_QUEUED -> enqueue(
                    event, metadata, sessionId, occurredAt
            );
            case AGENT_ACTIVATION_STARTED -> startActivation(
                    run, metadata, sessionId, occurredAt
            );
            case AGENT_REPORTED -> report(event, metadata, sessionId, occurredAt);
            case AGENT_CHECKPOINTED -> checkpoint(
                    event, metadata, sessionId, occurredAt
            );
            case AGENT_ACTIVATION_INTERRUPTED -> finishActivation(
                    metadata, sessionId, "interrupted", event.getOutput(), occurredAt
            );
            case AGENT_COMPLETED -> finishActivation(
                    metadata, sessionId, "idle", "", occurredAt
            );
            case AGENT_FAILED -> finishActivation(
                    metadata, sessionId, "failed", event.getErrorMessage(), occurredAt
            );
            default -> {
                // Child step events remain in conversation_run_event only.
            }
        }
    }

    public List<AgentSessionSnapshot> listSnapshots(String taskId) {
        if (taskId == null || taskId.isBlank()) {
            return List.of();
        }
        return sessionMapper.selectList(
                Wrappers.<AgentSession>lambdaQuery()
                        .eq(AgentSession::getTaskId, taskId)
                        .eq(AgentSession::getMode, "continuable")
                        .orderByDesc(AgentSession::getUpdatedAt)
                        .last("LIMIT 200")
        ).stream().map(this::snapshot).toList();
    }

    private void createSession(
            ConversationRun run,
            ChatStreamEvent event,
            Map<String, Object> metadata,
            String sessionId,
            Instant now
    ) {
        if (sessionMapper.selectById(sessionId) != null) {
            return;
        }
        AgentSession session = new AgentSession();
        session.setSessionId(sessionId);
        session.setAgentId(text(metadata, "agentId"));
        session.setTaskId(run.getTaskId());
        session.setParentSessionId(text(metadata, "parentSessionId"));
        session.setParentAgentId(text(metadata, "parentAgentId"));
        session.setTeamId(firstText(text(metadata, "teamId"), run.getTaskId()));
        session.setLabel(firstText(text(metadata, "agentLabel"), event.getTitle()));
        session.setMode("continuable");
        session.setStatus(firstText(text(metadata, "agentStatus"), "idle"));
        session.setDelegationDepth(integer(metadata, "delegationDepth"));
        session.setModel(safe(event.getModel()));
        session.setLatestReport("");
        session.setUnreadReportCount(0);
        session.setActiveActivationId("");
        session.setCreatedAt(now);
        session.setUpdatedAt(now);
        sessionMapper.insert(session);
    }

    private void enqueue(
            ChatStreamEvent event,
            Map<String, Object> metadata,
            String sessionId,
            Instant now
    ) {
        AgentSession session = requireSession(sessionId);
        long sequence = number(metadata, "inboxSequence");
        boolean alreadyConsumed = sequence <= session.getConsumedInboxSequence();
        if (inboxMapper.selectById(event.getItemId()) == null) {
            AgentInboxMessage message = new AgentInboxMessage();
            message.setMessageId(event.getItemId());
            message.setSessionId(sessionId);
            message.setSequence(sequence);
            message.setSenderAgentId(text(metadata, "senderAgentId"));
            message.setSenderLabel(text(metadata, "senderAgentLabel"));
            message.setMessageKind(firstText(
                    text(metadata, "messageKind"), "task"
            ));
            message.setContent(safe(event.getDelta()));
            message.setStatus(alreadyConsumed ? "consumed" : "pending");
            message.setCreatedAt(now);
            if (alreadyConsumed) {
                message.setConsumedAt(now);
            }
            inboxMapper.insert(message);
        }
        session.setLastInboxSequence(Math.max(
                session.getLastInboxSequence(), sequence
        ));
        session.setUpdatedAt(now);
        sessionMapper.updateById(session);
    }

    private void startActivation(
            ConversationRun run,
            Map<String, Object> metadata,
            String sessionId,
            Instant now
    ) {
        AgentSession session = requireSession(sessionId);
        String activationId = text(metadata, "activationId");
        long consumed = number(metadata, "consumedInboxSequence");
        if (!activationId.isBlank() && activationMapper.selectById(activationId) == null) {
            AgentActivation activation = new AgentActivation();
            activation.setActivationId(activationId);
            activation.setSessionId(sessionId);
            activation.setRunId(run.getRunId());
            activation.setStatus("running");
            activation.setConsumedInboxSequence(consumed);
            activation.setStartedAt(now);
            activation.setErrorMessage("");
            activationMapper.insert(activation);
        }
        for (AgentInboxMessage message : inboxMapper.selectList(
                Wrappers.<AgentInboxMessage>lambdaQuery()
                        .eq(AgentInboxMessage::getSessionId, sessionId)
                        .eq(AgentInboxMessage::getStatus, "pending")
                        .le(AgentInboxMessage::getSequence, consumed)
        )) {
            message.setStatus("consumed");
            message.setConsumedAt(now);
            inboxMapper.updateById(message);
        }
        session.setStatus("running");
        session.setActiveActivationId(activationId);
        session.setConsumedInboxSequence(Math.max(
                session.getConsumedInboxSequence(), consumed
        ));
        session.setUpdatedAt(now);
        sessionMapper.updateById(session);
    }

    private void report(
            ChatStreamEvent event,
            Map<String, Object> metadata,
            String sessionId,
            Instant now
    ) {
        AgentSession session = requireSession(sessionId);
        session.setLatestReport(safe(event.getOutput()));
        session.setUnreadReportCount(Math.max(
                session.getUnreadReportCount(), integer(metadata, "unreadReportCount")
        ));
        session.setUpdatedAt(now);
        sessionMapper.updateById(session);
    }

    private void checkpoint(
            ChatStreamEvent event,
            Map<String, Object> metadata,
            String sessionId,
            Instant now
    ) {
        AgentSession session = requireSession(sessionId);
        long sequence = number(metadata, "checkpointSequence");
        if (checkpointMapper.selectById(event.getItemId()) == null) {
            AgentCheckpoint checkpoint = new AgentCheckpoint();
            checkpoint.setCheckpointId(event.getItemId());
            checkpoint.setSessionId(sessionId);
            checkpoint.setSequence(sequence);
            checkpoint.setConsumedInboxSequence(number(
                    metadata, "consumedInboxSequence"
            ));
            checkpoint.setTranscriptJson(write(metadata.get("transcript")));
            checkpoint.setSummary(text(metadata, "summary"));
            checkpoint.setStatus(firstText(text(metadata, "agentStatus"), "idle"));
            checkpoint.setCreatedAt(now);
            checkpointMapper.insert(checkpoint);
        }
        session.setCheckpointSequence(Math.max(
                session.getCheckpointSequence(), sequence
        ));
        session.setConsumedInboxSequence(Math.max(
                session.getConsumedInboxSequence(),
                number(metadata, "consumedInboxSequence")
        ));
        String checkpointStatus = firstText(
                text(metadata, "agentStatus"), session.getStatus()
        );
        session.setStatus(checkpointStatus);
        if (!"running".equals(checkpointStatus)
                && !session.getActiveActivationId().isBlank()) {
            AgentActivation activation = activationMapper.selectById(
                    session.getActiveActivationId()
            );
            if (activation != null) {
                activation.setStatus("idle".equals(checkpointStatus)
                        ? "completed" : checkpointStatus);
                activation.setCompletedAt(now);
                activationMapper.updateById(activation);
            }
            session.setActiveActivationId("");
        }
        session.setUpdatedAt(now);
        sessionMapper.updateById(session);
    }

    private void finishActivation(
            Map<String, Object> metadata,
            String sessionId,
            String sessionStatus,
            String errorMessage,
            Instant now
    ) {
        AgentSession session = requireSession(sessionId);
        String activationId = firstText(
                text(metadata, "activationId"), session.getActiveActivationId()
        );
        if (!activationId.isBlank()) {
            AgentActivation activation = activationMapper.selectById(activationId);
            if (activation != null) {
                activation.setStatus("idle".equals(sessionStatus)
                        ? "completed" : sessionStatus);
                activation.setCompletedAt(now);
                activation.setErrorMessage(safe(errorMessage));
                activationMapper.updateById(activation);
            }
        }
        session.setStatus(sessionStatus);
        session.setActiveActivationId("");
        session.setUpdatedAt(now);
        sessionMapper.updateById(session);
    }

    private AgentSessionSnapshot snapshot(AgentSession session) {
        List<AgentInboxSnapshot> inbox = inboxMapper.selectList(
                Wrappers.<AgentInboxMessage>lambdaQuery()
                        .eq(AgentInboxMessage::getSessionId, session.getSessionId())
                        .orderByDesc(AgentInboxMessage::getSequence)
                        .last("LIMIT 2000")
        ).stream().map(message -> new AgentInboxSnapshot(
                message.getMessageId(), message.getSequence(),
                message.getSenderAgentId(), message.getSenderLabel(),
                message.getContent(), message.getStatus(), message.getMessageKind()
        )).sorted(java.util.Comparator.comparingLong(
                AgentInboxSnapshot::sequence
        )).toList();
        AgentCheckpoint latest = checkpointMapper.selectOne(
                Wrappers.<AgentCheckpoint>lambdaQuery()
                        .eq(AgentCheckpoint::getSessionId, session.getSessionId())
                        .orderByDesc(AgentCheckpoint::getSequence)
                        .last("LIMIT 1")
        );
        AgentCheckpointSnapshot checkpoint = latest == null ? null
                : new AgentCheckpointSnapshot(
                        latest.getSequence(), latest.getConsumedInboxSequence(),
                        readTranscript(latest.getTranscriptJson()), latest.getSummary()
                );
        return new AgentSessionSnapshot(
                session.getAgentId(), session.getSessionId(),
                session.getParentAgentId(), session.getParentSessionId(),
                session.getTeamId(), session.getActiveActivationId(),
                session.getLabel(), session.getStatus(), session.getMode(),
                session.getDelegationDepth(), session.getModel(),
                session.getUnreadReportCount(), session.getLatestReport(),
                inbox, checkpoint
        );
    }

    private AgentSession requireSession(String sessionId) {
        AgentSession session = sessionMapper.selectById(sessionId);
        if (session == null) {
            throw new IllegalStateException("Agent Session 投影缺少创建事件: " + sessionId);
        }
        return session;
    }

    private String write(Object value) {
        try {
            return objectMapper.writeValueAsString(value == null ? List.of() : value);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("无法保存 Agent Checkpoint", error);
        }
    }

    private List<Map<String, Object>> readTranscript(String value) {
        try {
            return objectMapper.readValue(
                    value == null || value.isBlank() ? "[]" : value,
                    TRANSCRIPT_TYPE
            );
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("Agent Checkpoint 数据损坏", error);
        }
    }

    private static String text(Map<String, Object> metadata, String key) {
        Object value = metadata.get(key);
        return value == null ? "" : String.valueOf(value);
    }

    private static long number(Map<String, Object> metadata, String key) {
        Object value = metadata.get(key);
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.parseLong(text(metadata, key));
        } catch (NumberFormatException ignored) {
            return 0L;
        }
    }

    private static int integer(Map<String, Object> metadata, String key) {
        return (int) Math.min(Integer.MAX_VALUE, number(metadata, key));
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }

    private static String firstText(String value, String fallback) {
        return value == null || value.isBlank() ? safe(fallback) : value;
    }
}
