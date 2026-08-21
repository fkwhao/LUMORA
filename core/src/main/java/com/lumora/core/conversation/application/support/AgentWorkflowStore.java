package com.lumora.core.conversation.application.support;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lumora.core.conversation.domain.entity.ConversationRun;
import com.lumora.core.conversation.domain.model.ChatStreamEvent;
import com.lumora.core.conversation.domain.model.ChatStreamEventType;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Durable projection for explicit Agent DAGs, node effects, and write leases.
 *
 * <p>The projector runs inside {@link ConversationRunStore}'s event transaction,
 * so a checkpoint and the public event that announced it commit atomically.</p>
 */
@Service
@RequiredArgsConstructor
public class AgentWorkflowStore {

    private static final TypeReference<List<Object>> LIST_TYPE = new TypeReference<>() { };

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public void project(ConversationRun run, ChatStreamEvent event, Instant now) {
        Map<String, Object> metadata = event.getMetadata();
        if ("workflow_checkpoint".equals(text(metadata, "category"))) {
            Object value = metadata.get("workflow");
            if (value instanceof Map<?, ?> raw) {
                projectCheckpoint(run, event, stringMap(raw), metadata, now);
            }
        }
        String workflowId = text(metadata, "workflowId");
        String nodeId = text(metadata, "workflowNodeId");
        if (workflowId.isBlank() || nodeId.isBlank()) {
            return;
        }
        projectLifecycle(run, event, metadata, workflowId, nodeId, now);
        projectEffect(run, event, metadata, workflowId, nodeId, now);
        projectLease(event, metadata, workflowId, nodeId, now);
    }

    public List<Map<String, Object>> listSnapshots(String taskId) {
        if (taskId == null || taskId.isBlank()) {
            return List.of();
        }
        List<WorkflowRow> workflows = jdbcTemplate.query("""
                SELECT * FROM agent_workflow
                WHERE task_id = ?
                ORDER BY updated_at DESC
                LIMIT 100
                """, (result, row) -> new WorkflowRow(
                        result.getString("workflow_id"),
                        result.getString("label"),
                        result.getString("owner_agent_id"),
                        result.getString("status"),
                        result.getLong("version"),
                        result.getLong("scheduler_sequence"),
                        result.getLong("quota_max_waves"),
                        result.getLong("quota_max_attempts"),
                        result.getLong("quota_max_runtime_ms"),
                        result.getLong("quota_used_waves"),
                        result.getLong("quota_used_attempts"),
                        result.getLong("quota_used_runtime_ms"),
                        result.getString("created_at"),
                        result.getString("updated_at")
                ),
                taskId.trim());
        return workflows.stream().map(this::snapshot).toList();
    }

    private void projectCheckpoint(
            ConversationRun run,
            ChatStreamEvent event,
            Map<String, Object> workflow,
            Map<String, Object> metadata,
            Instant now
    ) {
        String workflowId = text(workflow, "workflowId");
        String label = text(workflow, "label");
        if (workflowId.isBlank() || label.isBlank()) {
            return;
        }
        long version = number(workflow, "version");
        Long existing = jdbcTemplate.query("""
                SELECT version FROM agent_workflow WHERE workflow_id = ?
                """, result -> result.next() ? result.getLong(1) : null, workflowId);
        if (existing != null && existing > version) {
            return;
        }
        Map<String, Object> quota = map(workflow.get("quota"));
        String createdAt = firstText(text(workflow, "createdAt"), now.toString());
        String updatedAt = firstText(text(workflow, "updatedAt"), now.toString());
        jdbcTemplate.update("""
                INSERT INTO agent_workflow (
                    workflow_id, task_id, owner_agent_id, label, status, version,
                    scheduler_sequence, quota_max_waves, quota_max_attempts,
                    quota_max_runtime_ms, quota_used_waves, quota_used_attempts,
                    quota_used_runtime_ms, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(workflow_id) DO UPDATE SET
                    owner_agent_id = excluded.owner_agent_id,
                    label = excluded.label,
                    status = excluded.status,
                    version = excluded.version,
                    scheduler_sequence = excluded.scheduler_sequence,
                    quota_max_waves = excluded.quota_max_waves,
                    quota_max_attempts = excluded.quota_max_attempts,
                    quota_max_runtime_ms = excluded.quota_max_runtime_ms,
                    quota_used_waves = excluded.quota_used_waves,
                    quota_used_attempts = excluded.quota_used_attempts,
                    quota_used_runtime_ms = excluded.quota_used_runtime_ms,
                    updated_at = excluded.updated_at
                """,
                workflowId, run.getTaskId(), text(workflow, "ownerAgentId"), label,
                firstText(text(workflow, "status"), "pending"), version,
                number(workflow, "schedulerSequence"),
                positive(quota, "maxWaves", 256),
                positive(quota, "maxTotalAttempts", 1024),
                positive(quota, "maxRuntimeMs", 604_800_000L),
                number(quota, "usedWaves"), number(quota, "usedAttempts"),
                number(quota, "usedRuntimeMs"), createdAt, updatedAt
        );
        Object rawNodes = workflow.get("nodes");
        if (rawNodes instanceof List<?> nodes) {
            for (Object value : nodes) {
                if (value instanceof Map<?, ?> rawNode) {
                    upsertNode(workflowId, stringMap(rawNode), now);
                }
            }
        }
        jdbcTemplate.update("""
                INSERT OR IGNORE INTO agent_workflow_checkpoint (
                    checkpoint_id, workflow_id, run_id, version, reason,
                    snapshot_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """, event.getItemId(), workflowId, run.getRunId(), version,
                text(metadata, "checkpointReason"), write(workflow), now.toString());
    }

    private void upsertNode(
            String workflowId,
            Map<String, Object> node,
            Instant now
    ) {
        String nodeId = text(node, "nodeId");
        if (nodeId.isBlank()) {
            return;
        }
        Map<String, Object> retry = map(node.get("retryPolicy"));
        jdbcTemplate.update("""
                INSERT INTO agent_workflow_node (
                    node_key, workflow_id, node_id, title, prompt, depends_on_json,
                    priority, deadline, retry_mode, max_attempts, write_scopes_json,
                    declared_write_scopes_json, evidence_refs_json, status, attempts,
                    result, error_message, failure_kind, agent_id, session_id,
                    effect_id, effect_state, dispatch_count, dispatch_sequence,
                    ready_since, duration_ms, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                          ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(node_key) DO UPDATE SET
                    title = excluded.title, prompt = excluded.prompt,
                    depends_on_json = excluded.depends_on_json,
                    priority = excluded.priority, deadline = excluded.deadline,
                    retry_mode = excluded.retry_mode, max_attempts = excluded.max_attempts,
                    write_scopes_json = excluded.write_scopes_json,
                    declared_write_scopes_json = excluded.declared_write_scopes_json,
                    evidence_refs_json = excluded.evidence_refs_json,
                    status = excluded.status, attempts = excluded.attempts,
                    result = excluded.result, error_message = excluded.error_message,
                    failure_kind = excluded.failure_kind, agent_id = excluded.agent_id,
                    session_id = excluded.session_id, effect_id = excluded.effect_id,
                    effect_state = excluded.effect_state,
                    dispatch_count = excluded.dispatch_count,
                    dispatch_sequence = excluded.dispatch_sequence,
                    ready_since = excluded.ready_since, duration_ms = excluded.duration_ms,
                    updated_at = excluded.updated_at
                """,
                workflowId + ":" + nodeId, workflowId, nodeId,
                text(node, "title"), text(node, "prompt"), write(node.get("dependsOn")),
                number(node, "priority"), nullableText(node, "deadline"),
                firstText(text(retry, "mode"), "never"),
                positive(retry, "maxAttempts", 1), write(node.get("writeScopes")),
                write(node.get("declaredWriteScopes")), write(node.get("evidenceRefs")),
                firstText(text(node, "status"), "pending"), number(node, "attempts"),
                text(node, "result"), text(node, "error"), text(node, "failureKind"),
                text(node, "agentId"), text(node, "sessionId"), text(node, "effectId"),
                firstText(text(node, "effectState"), "not_started"),
                number(node, "dispatchCount"), number(node, "dispatchSequence"),
                nullableText(node, "readySince"), number(node, "durationMs"), now.toString()
        );
    }

    private void projectLifecycle(
            ConversationRun run,
            ChatStreamEvent event,
            Map<String, Object> metadata,
            String workflowId,
            String nodeId,
            Instant now
    ) {
        String nodeKey = workflowId + ":" + nodeId;
        if (event.getType() == ChatStreamEventType.AGENT_STARTED) {
            jdbcTemplate.update("""
                    UPDATE agent_workflow_node
                    SET status = 'running', agent_id = ?, session_id = ?, updated_at = ?
                    WHERE node_key = ?
                    """, text(metadata, "agentId"), text(metadata, "sessionId"),
                    now.toString(), nodeKey);
        } else if (event.getType() == ChatStreamEventType.AGENT_COMPLETED) {
            jdbcTemplate.update("""
                    UPDATE agent_workflow_node
                    SET status = 'completed', result = ?, error_message = '',
                        failure_kind = '', effect_state = 'committed', updated_at = ?
                    WHERE node_key = ?
                    """, safe(event.getOutput()), now.toString(), nodeKey);
        } else if (event.getType() == ChatStreamEventType.AGENT_FAILED) {
            jdbcTemplate.update("""
                    UPDATE agent_workflow_node
                    SET status = 'failed', error_message = ?, failure_kind = ?,
                        effect_state = ?, updated_at = ?
                    WHERE node_key = ?
                    """, firstText(event.getErrorMessage(), event.getOutput()),
                    firstText(text(metadata, "failureKind"), "agent_failed"),
                    firstText(text(metadata, "toolExecutionState"), "unknown"),
                    now.toString(), nodeKey);
        }
    }

    private void projectEffect(
            ConversationRun run,
            ChatStreamEvent event,
            Map<String, Object> metadata,
            String workflowId,
            String nodeId,
            Instant now
    ) {
        String childType = text(metadata, "childEventType");
        if (!List.of("tool_started", "tool_completed", "tool_failed").contains(childType)) {
            return;
        }
        String effectId = text(metadata, "effectId");
        if (effectId.isBlank()) {
            return;
        }
        String state = switch (childType) {
            case "tool_started" -> "started";
            case "tool_completed" -> "committed";
            default -> firstText(text(metadata, "toolExecutionState"), "unknown");
        };
        String committedAt = "committed".equals(state) ? now.toString() : null;
        jdbcTemplate.update("""
                INSERT INTO agent_effect_commit (
                    effect_id, workflow_id, node_id, run_id, tool_name, state,
                    arguments_json, result_ref, started_at, updated_at, committed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(effect_id) DO UPDATE SET
                    state = excluded.state, result_ref = excluded.result_ref,
                    updated_at = excluded.updated_at,
                    committed_at = COALESCE(excluded.committed_at, committed_at)
                """, effectId, workflowId, nodeId, run.getRunId(),
                safe(event.getToolName()), state, write(event.getArguments()),
                safe(event.getOutput()), now.toString(), now.toString(), committedAt);
        jdbcTemplate.update("""
                UPDATE agent_workflow_node
                SET effect_id = ?, effect_state = ?, updated_at = ?
                WHERE node_key = ?
                """, effectId, state, now.toString(), workflowId + ":" + nodeId);
    }

    private void projectLease(
            ChatStreamEvent event,
            Map<String, Object> metadata,
            String workflowId,
            String nodeId,
            Instant now
    ) {
        Map<String, Object> lease = map(metadata.get("writeLease"));
        String leaseId = text(lease, "leaseId");
        if (leaseId.isBlank()) {
            return;
        }
        boolean terminal = event.getType() == ChatStreamEventType.AGENT_COMPLETED
                || event.getType() == ChatStreamEventType.AGENT_FAILED;
        String state = terminal ? "released"
                : firstText(text(lease, "leaseState"), "active");
        jdbcTemplate.update("""
                INSERT INTO agent_write_lease (
                    lease_id, workflow_id, node_id, owner_id, owner_label,
                    scopes_json, fencing_token, state, expires_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(lease_id) DO UPDATE SET
                    state = excluded.state, updated_at = excluded.updated_at,
                    expires_at = excluded.expires_at
                """, leaseId, workflowId, nodeId, text(lease, "ownerId"),
                text(lease, "ownerLabel"), write(lease.get("writeScopes")),
                number(lease, "fencingToken"), state, nullableText(lease, "expiresAt"),
                now.toString(), now.toString());
    }

    private Map<String, Object> snapshot(WorkflowRow workflow) {
        String workflowId = workflow.workflowId();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("workflowId", workflowId);
        result.put("label", workflow.label());
        result.put("ownerAgentId", workflow.ownerAgentId());
        result.put("status", workflow.status());
        result.put("version", workflow.version());
        result.put("schedulerSequence", workflow.schedulerSequence());
        result.put("createdAt", workflow.createdAt());
        result.put("updatedAt", workflow.updatedAt());
        result.put("quota", Map.of(
                "maxWaves", workflow.quotaMaxWaves(),
                "maxTotalAttempts", workflow.quotaMaxAttempts(),
                "maxRuntimeMs", workflow.quotaMaxRuntimeMs(),
                "usedWaves", workflow.quotaUsedWaves(),
                "usedAttempts", workflow.quotaUsedAttempts(),
                "usedRuntimeMs", workflow.quotaUsedRuntimeMs()
        ));
        List<Map<String, Object>> nodes = jdbcTemplate.query("""
                SELECT node.*, (
                    SELECT COUNT(*) FROM agent_effect_commit effect
                    WHERE effect.workflow_id = node.workflow_id
                      AND effect.node_id = node.node_id
                ) AS effect_count
                FROM agent_workflow_node node
                WHERE node.workflow_id = ?
                ORDER BY node.dispatch_sequence, node.node_id
                """, (node, row) -> nodeSnapshot(node), workflowId);
        result.put("nodes", nodes);
        return result;
    }

    private Map<String, Object> nodeSnapshot(java.sql.ResultSet node)
            throws java.sql.SQLException {
        Map<String, Object> result = new LinkedHashMap<>();
        String workflowId = node.getString("workflow_id");
        String nodeId = node.getString("node_id");
        result.put("nodeId", nodeId);
        result.put("title", node.getString("title"));
        result.put("prompt", node.getString("prompt"));
        result.put("dependsOn", readList(node.getString("depends_on_json")));
        result.put("priority", node.getInt("priority"));
        result.put("deadline", node.getString("deadline"));
        result.put("retryPolicy", Map.of(
                "mode", node.getString("retry_mode"),
                "maxAttempts", node.getInt("max_attempts")
        ));
        result.put("writeScopes", readList(node.getString("write_scopes_json")));
        result.put("declaredWriteScopes",
                readList(node.getString("declared_write_scopes_json")));
        result.put("evidenceRefs", readList(node.getString("evidence_refs_json")));
        result.put("status", node.getString("status"));
        result.put("attempts", node.getInt("attempts"));
        putNullable(result, "result", node.getString("result"));
        putNullable(result, "error", node.getString("error_message"));
        putNullable(result, "failureKind", node.getString("failure_kind"));
        putNullable(result, "agentId", node.getString("agent_id"));
        putNullable(result, "sessionId", node.getString("session_id"));
        putNullable(result, "effectId", node.getString("effect_id"));
        result.put("effectState", node.getString("effect_state"));
        result.put("dispatchCount", node.getInt("dispatch_count"));
        result.put("dispatchSequence", node.getLong("dispatch_sequence"));
        result.put("readySince", node.getString("ready_since"));
        result.put("durationMs", node.getLong("duration_ms"));
        if ("running".equals(node.getString("status"))) {
            int effects = node.getInt("effect_count");
            result.put("recoveryState", effects == 0
                    ? "safe_to_retry" : "requires_verification");
        } else if ("completed".equals(node.getString("status"))) {
            result.put("recoveryState", "completed");
        }
        return result;
    }

    private String write(Object value) {
        try {
            return objectMapper.writeValueAsString(value == null ? List.of() : value);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("无法保存 Agent 工作流状态", error);
        }
    }

    private List<Object> readList(String value) {
        try {
            return objectMapper.readValue(
                    value == null || value.isBlank() ? "[]" : value, LIST_TYPE
            );
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("Agent 工作流节点数据损坏", error);
        }
    }

    private static Map<String, Object> stringMap(Map<?, ?> raw) {
        Map<String, Object> result = new HashMap<>();
        raw.forEach((key, value) -> result.put(String.valueOf(key), value));
        return result;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> map(Object value) {
        return value instanceof Map<?, ?> raw ? stringMap(raw) : Map.of();
    }

    private static String text(Map<String, Object> values, String key) {
        Object value = values.get(key);
        return value == null ? "" : String.valueOf(value);
    }

    private static String nullableText(Map<String, Object> values, String key) {
        String value = text(values, key);
        return value.isBlank() ? null : value;
    }

    private static long number(Map<String, Object> values, String key) {
        Object value = values.get(key);
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.parseLong(text(values, key));
        } catch (NumberFormatException ignored) {
            return 0L;
        }
    }

    private static long positive(
            Map<String, Object> values, String key, long fallback
    ) {
        long value = number(values, key);
        return value > 0 ? value : fallback;
    }

    private static String firstText(String value, String fallback) {
        return value == null || value.isBlank() ? safe(fallback) : value;
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }

    private static void putNullable(
            Map<String, Object> values, String key, String value
    ) {
        values.put(key, value == null || value.isBlank() ? null : value);
    }

    private record WorkflowRow(
            String workflowId,
            String label,
            String ownerAgentId,
            String status,
            long version,
            long schedulerSequence,
            long quotaMaxWaves,
            long quotaMaxAttempts,
            long quotaMaxRuntimeMs,
            long quotaUsedWaves,
            long quotaUsedAttempts,
            long quotaUsedRuntimeMs,
            String createdAt,
            String updatedAt
    ) { }
}
