package com.lumora.core.conversation.application.support;

import com.lumora.core.conversation.domain.entity.ConversationRun;
import com.lumora.core.conversation.domain.model.AgentSessionSnapshot;
import com.lumora.core.conversation.domain.model.ChatStreamEvent;
import com.lumora.core.conversation.domain.model.ChatStreamEventType;
import com.lumora.core.conversation.domain.model.ConversationRunStatus;
import com.lumora.core.conversation.domain.model.ConversationRunTrigger;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class AgentSessionStoreIntegrationTest {

    private static final Path DATABASE_PATH = Path.of(
            "target", "agent-session-" + UUID.randomUUID() + ".db"
    ).toAbsolutePath();

    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private ConversationRunStore runStore;
    @Autowired private AgentSessionStore sessionStore;

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:"
                + DATABASE_PATH.toString().replace('\\', '/'));
    }

    @Test
    void projectsInboxActivationReportAndCheckpointIntoRecoverableSnapshot() {
        Instant now = Instant.parse("2026-08-19T00:00:00Z");
        jdbcTemplate.update("""
                INSERT INTO agent_task (
                    task_id, goal, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?)
                """, "task-session", "test", "RUNNING", now, now);

        ConversationRun run = new ConversationRun();
        run.setRunId("run-session");
        run.setTaskId("task-session");
        run.setStatus(ConversationRunStatus.RUNNING);
        run.setTriggerType(ConversationRunTrigger.MESSAGE);
        run.setInputContent("start");
        run.setAttachmentsJson("[]");
        run.setModel("model");
        run.setReasoningEffort("");
        run.setWorkspacePath("");
        run.setPermissionMode("full_access");
        run.setErrorMessage("");
        run.setCreatedAt(now);
        run.setUpdatedAt(now);
        runStore.insert(run);

        Map<String, Object> identity = Map.of(
                "agentId", "agent-1",
                "sessionId", "session-1",
                "parentAgentId", "supervisor",
                "parentSessionId", "run-session",
                "agentLabel", "研究",
                "delegationDepth", 1,
                "sessionMode", "continuable"
        );
        runStore.appendEvents("run-session", List.of(
                event(ChatStreamEventType.AGENT_SESSION_CREATED,
                        "agent-1", "研究", "", "", merge(identity, Map.of(
                                "agentStatus", "idle"
                        ))),
                event(ChatStreamEventType.AGENT_INBOX_ENQUEUED,
                        "message-1", "研究", "检查入口", "", merge(identity, Map.of(
                                "inboxSequence", 1,
                                "senderAgentId", "supervisor",
                                "messageStatus", "pending"
                        ))),
                event(ChatStreamEventType.AGENT_CHECKPOINTED,
                        "checkpoint-1", "研究", "", "", merge(identity, Map.of(
                                "agentStatus", "running",
                                "checkpointSequence", 1,
                                "consumedInboxSequence", 1,
                                "transcript", List.of(Map.of(
                                        "role", "user", "content", "检查入口"
                                ))
                        ))),
                event(ChatStreamEventType.AGENT_ACTIVATION_STARTED,
                        "activation-1", "研究", "", "", merge(identity, Map.of(
                                "agentStatus", "running",
                                "activationId", "activation-1",
                                "consumedInboxSequence", 1
                        ))),
                event(ChatStreamEventType.AGENT_REPORTED,
                        "agent-1", "研究", "", "找到入口", merge(identity, Map.of(
                                "agentStatus", "running",
                                "unreadReportCount", 1
                        ))),
                event(ChatStreamEventType.AGENT_CHECKPOINTED,
                        "checkpoint-2", "研究", "", "", merge(identity, Map.of(
                                "agentStatus", "idle",
                                "checkpointSequence", 2,
                                "consumedInboxSequence", 1,
                                "transcript", List.of(
                                        Map.of("role", "user", "content", "检查入口"),
                                        Map.of("role", "assistant", "content", "找到入口")
                                )
                        ))),
                event(ChatStreamEventType.AGENT_COMPLETED,
                        "agent-1", "研究", "", "找到入口", merge(identity, Map.of(
                                "agentStatus", "idle",
                                "activationId", "activation-1",
                                "activationStatus", "completed"
                        )))
        ));

        AgentSessionSnapshot snapshot = sessionStore
                .listSnapshots("task-session").getFirst();
        assertThat(snapshot.status()).isEqualTo("idle");
        assertThat(snapshot.latestReport()).isEqualTo("找到入口");
        assertThat(snapshot.unreadReportCount()).isEqualTo(1);
        assertThat(snapshot.inbox()).singleElement()
                .satisfies(message -> assertThat(message.status())
                        .isEqualTo("consumed"));
        assertThat(snapshot.checkpoint().sequence()).isEqualTo(2);
        assertThat(snapshot.checkpoint().transcript()).hasSize(2);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT status FROM agent_activation WHERE activation_id = ?",
                String.class, "activation-1"
        )).isEqualTo("completed");
    }

    private static ChatStreamEvent event(
            ChatStreamEventType type,
            String itemId,
            String title,
            String delta,
            String output,
            Map<String, Object> metadata
    ) {
        return new ChatStreamEvent(
                type, delta, "model", null, "", itemId, "", "", title,
                Map.of(), output, 0L, null, metadata
        );
    }

    private static Map<String, Object> merge(
            Map<String, Object> identity,
            Map<String, Object> values
    ) {
        java.util.HashMap<String, Object> merged = new java.util.HashMap<>(identity);
        merged.putAll(values);
        return Map.copyOf(merged);
    }
}
