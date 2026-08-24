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
import java.util.Arrays;
import java.util.LinkedHashMap;
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
    @SuppressWarnings("unchecked")
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
                "teamId", "task-session",
                "agentLabel", "研究",
                "delegationDepth", 1,
                "sessionMode", "continuable"
        );
        Map<String, Object> toolInput = new LinkedHashMap<>();
        toolInput.put("path", "src/main/java/App.java");
        toolInput.put("optional", null);
        toolInput.put("candidates", Arrays.asList(null, "fallback.java"));
        Map<String, Object> providerState = Map.of(
                "apiFormat", "anthropic",
                "scope", "deepseek-v4-flash-scope",
                "contentBlocks", List.of(
                        Map.of(
                                "type", "thinking",
                                "thinking", "需要先检查入口文件",
                                "signature", "signed-thinking-state"
                        ),
                        Map.of(
                                "type", "tool_use",
                                "id", "call-read-entry",
                                "name", "read_file",
                                "input", toolInput
                        )
                )
        );
        runStore.appendEvents("run-session", List.of(
                event(ChatStreamEventType.AGENT_SESSION_CREATED,
                        "agent-1", "研究", "", "", merge(identity, Map.of(
                                "agentStatus", "idle"
                        ))),
                event(ChatStreamEventType.AGENT_PEER_MESSAGE_QUEUED,
                        "message-1", "研究", "检查入口", "", merge(identity, Map.of(
                                "inboxSequence", 1,
                                "senderAgentId", "agent-peer",
                                "senderAgentLabel", "资料核验",
                                "messageKind", "peer",
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
                                        Map.of(
                                                "role", "assistant",
                                                "content", "",
                                                "toolCalls", List.of(Map.of(
                                                        "id", "call-read-entry",
                                                        "name", "read_file",
                                                        "arguments", "{\"path\":\"src/main/java/App.java\"}"
                                                )),
                                                "providerState", providerState
                                        ),
                                        Map.of(
                                                "role", "tool",
                                                "content", "入口文件内容",
                                                "toolCallId", "call-read-entry"
                                        ),
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
        assertThat(snapshot.teamId()).isEqualTo("task-session");
        assertThat(snapshot.activeActivationId()).isEmpty();
        assertThat(snapshot.latestReport()).isEqualTo("找到入口");
        assertThat(snapshot.unreadReportCount()).isEqualTo(1);
        assertThat(snapshot.inbox()).singleElement()
                .satisfies(message -> {
                    assertThat(message.status()).isEqualTo("consumed");
                    assertThat(message.messageKind()).isEqualTo("peer");
                    assertThat(message.senderLabel()).isEqualTo("资料核验");
        });
        assertThat(snapshot.checkpoint().sequence()).isEqualTo(2);
        assertThat(snapshot.checkpoint().transcript()).hasSize(4);
        Map<String, Object> restoredProviderState = (Map<String, Object>) snapshot
                .checkpoint().transcript().get(1).get("providerState");
        assertThat(restoredProviderState)
                .containsEntry("apiFormat", "anthropic")
                .containsEntry("scope", "deepseek-v4-flash-scope");
        List<Map<String, Object>> restoredBlocks =
                (List<Map<String, Object>>) restoredProviderState.get("contentBlocks");
        assertThat(restoredBlocks).hasSize(2);
        assertThat(restoredBlocks.getFirst())
                .containsEntry("type", "thinking")
                .containsEntry("thinking", "需要先检查入口文件")
                .containsEntry("signature", "signed-thinking-state");
        assertThat(restoredBlocks.get(1))
                .containsEntry("type", "tool_use")
                .containsEntry("id", "call-read-entry")
                .containsEntry("name", "read_file");
        Map<String, Object> restoredInput =
                (Map<String, Object>) restoredBlocks.get(1).get("input");
        assertThat(restoredInput)
                .containsEntry("path", "src/main/java/App.java")
                .containsKey("optional");
        assertThat(restoredInput.get("optional")).isNull();
        assertThat(restoredInput.get("candidates"))
                .isEqualTo(Arrays.asList(null, "fallback.java"));
        assertThat(jdbcTemplate.queryForObject(
                "SELECT status FROM agent_activation WHERE activation_id = ?",
                String.class, "activation-1"
        )).isEqualTo("completed");
    }

    @Test
    void toleratesCheckpointAndInboxArrivingBeforeTheCreateEvent() {
        Instant now = Instant.parse("2026-08-19T01:00:00Z");
        jdbcTemplate.update("""
                INSERT INTO agent_task (
                    task_id, goal, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?)
                """, "task-out-of-order", "test", "RUNNING", now, now);

        ConversationRun run = new ConversationRun();
        run.setRunId("run-out-of-order");
        run.setTaskId("task-out-of-order");
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
                "agentId", "agent-out-of-order",
                "sessionId", "session-out-of-order",
                "parentAgentId", "supervisor",
                "parentSessionId", "run-out-of-order",
                "teamId", "task-out-of-order",
                "agentLabel", "乱序容错",
                "delegationDepth", 1,
                "sessionMode", "continuable"
        );
        runStore.appendEvents("run-out-of-order", List.of(
                event(ChatStreamEventType.AGENT_CHECKPOINTED,
                        "checkpoint-out-of-order", "乱序容错", "", "",
                        merge(identity, Map.of(
                                "agentStatus", "running",
                                "checkpointSequence", 1,
                                "consumedInboxSequence", 1,
                                "transcript", List.of(Map.of(
                                        "role", "user", "content", "检查入口"
                                ))
                        ))),
                event(ChatStreamEventType.AGENT_ACTIVATION_STARTED,
                        "activation-out-of-order", "乱序容错", "", "",
                        merge(identity, Map.of(
                                "agentStatus", "running",
                                "activationId", "activation-out-of-order",
                                "consumedInboxSequence", 1
                        ))),
                event(ChatStreamEventType.AGENT_INBOX_ENQUEUED,
                        "message-out-of-order", "乱序容错", "检查入口", "",
                        merge(identity, Map.of(
                                "inboxSequence", 1,
                                "senderAgentId", "supervisor",
                                "messageKind", "task",
                                "messageStatus", "pending"
                        ))),
                event(ChatStreamEventType.AGENT_SESSION_CREATED,
                        "agent-out-of-order", "乱序容错", "", "",
                        merge(identity, Map.of("agentStatus", "idle"))),
                event(ChatStreamEventType.AGENT_COMPLETED,
                        "activation-out-of-order:completed", "乱序容错", "",
                        "完成", merge(identity, Map.of(
                                "agentStatus", "idle",
                                "activationId", "activation-out-of-order",
                                "activationStatus", "completed"
                        )))
        ));

        AgentSessionSnapshot snapshot = sessionStore
                .listSnapshots("task-out-of-order").getFirst();
        assertThat(snapshot.status()).isEqualTo("idle");
        assertThat(snapshot.checkpoint().sequence()).isEqualTo(1);
        assertThat(snapshot.inbox()).singleElement().satisfies(message -> {
            assertThat(message.sequence()).isEqualTo(1);
            assertThat(message.status()).isEqualTo("consumed");
        });
        assertThat(jdbcTemplate.queryForObject(
                "SELECT status FROM agent_activation WHERE activation_id = ?",
                String.class, "activation-out-of-order"
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
