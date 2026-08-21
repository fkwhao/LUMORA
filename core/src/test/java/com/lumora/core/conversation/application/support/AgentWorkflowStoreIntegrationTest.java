package com.lumora.core.conversation.application.support;

import com.lumora.core.conversation.domain.entity.ConversationRun;
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
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class AgentWorkflowStoreIntegrationTest {

    private static final Path DATABASE_PATH = Path.of(
            "target", "agent-workflow-" + UUID.randomUUID() + ".db"
    ).toAbsolutePath();

    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private ConversationRunStore runStore;
    @Autowired private AgentWorkflowStore workflowStore;

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:"
                + DATABASE_PATH.toString().replace('\\', '/'));
    }

    @Test
    void atomicallyProjectsCheckpointEffectsAndRecoveryDisposition() {
        Instant now = Instant.parse("2026-08-20T00:00:00Z");
        jdbcTemplate.update("""
                INSERT INTO agent_task (
                    task_id, goal, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?)
                """, "task-workflow", "test", "RUNNING", now, now);

        ConversationRun run = new ConversationRun();
        run.setRunId("run-workflow");
        run.setTaskId("task-workflow");
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

        Map<String, Object> workflow = new HashMap<>();
        workflow.put("workflowId", "workflow-1");
        workflow.put("label", "durable");
        workflow.put("ownerAgentId", "supervisor");
        workflow.put("status", "running");
        workflow.put("version", 2);
        workflow.put("schedulerSequence", 2);
        workflow.put("createdAt", now.toString());
        workflow.put("updatedAt", now.toString());
        workflow.put("quota", Map.of(
                "maxWaves", 20, "maxTotalAttempts", 50,
                "maxRuntimeMs", 100_000, "usedWaves", 1,
                "usedAttempts", 2, "usedRuntimeMs", 0
        ));
        workflow.put("nodes", List.of(
                node("safe", 1), node("effect", 2)
        ));
        ChatStreamEvent checkpoint = event(
                ChatStreamEventType.PROGRESS_MESSAGE,
                "workflow-1:checkpoint:2", "", Map.of(
                        "category", "workflow_checkpoint",
                        "checkpointReason", "wave_started",
                        "workflow", workflow
                )
        );
        runStore.appendEvent("run-workflow", checkpoint);

        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM agent_workflow_checkpoint",
                Integer.class
        )).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM conversation_run_event",
                Integer.class
        )).isEqualTo(1);

        Map<String, Object> identity = Map.of(
                "workflowId", "workflow-1",
                "workflowNodeId", "effect",
                "agentId", "agent-effect",
                "sessionId", "session-effect"
        );
        runStore.appendEvents("run-workflow", List.of(
                event(ChatStreamEventType.AGENT_STARTED, "agent-effect", "", identity),
                event(ChatStreamEventType.AGENT_EVENT, "effect:tool", "", merge(
                        identity, Map.of(
                                "childEventType", "tool_started",
                                "effectId", "effect-1",
                                "toolExecutionState", "started"
                        )
                ))
        ));

        Map<String, Object> snapshot = workflowStore
                .listSnapshots("task-workflow").getFirst();
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> nodes = (List<Map<String, Object>>) snapshot.get("nodes");
        assertThat(nodes).filteredOn(node -> "safe".equals(node.get("nodeId")))
                .singleElement().extracting(node -> node.get("recoveryState"))
                .isEqualTo("safe_to_retry");
        assertThat(nodes).filteredOn(node -> "effect".equals(node.get("nodeId")))
                .singleElement().extracting(node -> node.get("recoveryState"))
                .isEqualTo("requires_verification");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT state FROM agent_effect_commit WHERE effect_id = ?",
                String.class, "effect-1"
        )).isEqualTo("started");

        runStore.appendEvent("run-workflow", event(
                ChatStreamEventType.AGENT_COMPLETED,
                "agent-effect", "done", identity
        ));
        assertThat(jdbcTemplate.queryForObject(
                "SELECT status FROM agent_workflow_node WHERE node_key = ?",
                String.class, "workflow-1:effect"
        )).isEqualTo("completed");
    }

    private static Map<String, Object> node(String id, int sequence) {
        Map<String, Object> node = new HashMap<>();
        node.put("nodeId", id);
        node.put("title", id);
        node.put("prompt", "run " + id);
        node.put("dependsOn", List.of());
        node.put("priority", 0);
        node.put("retryPolicy", Map.of("mode", "safe", "maxAttempts", 2));
        node.put("writeScopes", List.of());
        node.put("declaredWriteScopes", List.of());
        node.put("evidenceRefs", List.of());
        node.put("status", "running");
        node.put("attempts", 1);
        node.put("effectState", "prepared");
        node.put("dispatchCount", 1);
        node.put("dispatchSequence", sequence);
        node.put("durationMs", 0);
        return node;
    }

    private static ChatStreamEvent event(
            ChatStreamEventType type,
            String itemId,
            String output,
            Map<String, Object> metadata
    ) {
        return new ChatStreamEvent(
                type, "", "model", null, "", itemId, "", "tool", "event",
                Map.of(), output, 0L, null, metadata
        );
    }

    private static Map<String, Object> merge(
            Map<String, Object> first,
            Map<String, Object> second
    ) {
        HashMap<String, Object> merged = new HashMap<>(first);
        merged.putAll(second);
        return Map.copyOf(merged);
    }
}
