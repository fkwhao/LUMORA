package com.lumora.core.conversation.application.support;

import com.lumora.core.conversation.domain.entity.ConversationRun;
import com.lumora.core.conversation.domain.model.ChatStreamEvent;
import com.lumora.core.conversation.domain.model.ChatStreamEventType;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.file.Path;
import java.nio.file.Files;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/** Durable authority for cooperative Local workspace revisions and ownership. */
@Service
public class WorkspaceChangeLedgerService {

    private static final Logger LOGGER = LoggerFactory.getLogger(
            WorkspaceChangeLedgerService.class
    );

    private static final int MAX_FILES_PER_EVENT = 500;
    private static final int MAX_TOTAL_PATCH_CHARS = 500_000;

    private final JdbcTemplate jdbcTemplate;
    private final Clock clock;

    public WorkspaceChangeLedgerService(JdbcTemplate jdbcTemplate, Clock clock) {
        this.jdbcTemplate = jdbcTemplate;
        this.clock = clock;
    }

    @Transactional
    public synchronized long project(
            ConversationRun run,
            ChatStreamEvent event
    ) {
        if (event.getType() != ChatStreamEventType.TOOL_COMPLETED
                && event.getType() != ChatStreamEventType.TOOL_FAILED) {
            return -1L;
        }
        List<Map<String, Object>> rawChanges = maps(
                event.getMetadata().get("workspaceChanges")
        );
        boolean hasCompletenessSignal = event.getMetadata().containsKey(
                "workspaceChangeSetComplete"
        );
        boolean complete = !hasCompletenessSignal
                || bool(event.getMetadata(), "workspaceChangeSetComplete");
        if (!complete || rawChanges.size() > MAX_FILES_PER_EVENT) {
            markIncomplete(
                    run.getRunId(),
                    "本轮有工具修改的文件数量超过安全追踪上限，"
                            + "Diff 仅展示已记录部分，自动撤回已禁用"
            );
        } else if (!hasCompletenessSignal
                && hasWriteResourceAccess(event.getMetadata())) {
            markIncomplete(
                    run.getRunId(),
                    "本轮存在写工具调用但缺少完整的文件副作用记录，"
                            + "自动撤回已禁用"
            );
        }
        List<Map<String, Object>> changes = rawChanges.stream()
                .filter(change -> !text(change, "path").isBlank())
                .limit(MAX_FILES_PER_EVENT)
                .toList();
        if (changes.isEmpty()) return -1L;
        String workspacePath = valueOrEmpty(run.getWorkspacePath());
        String repositoryRoot = firstText(
                text(changes.get(0), "repositoryRoot"), ""
        );
        String workspaceKey = workspaceKey(
                repositoryRoot.isBlank() ? workspacePath : repositoryRoot
        );
        String firstChangeId = changeId(
                run.getRunId(), valueOrEmpty(event.getToolCallId()),
                changes.get(0), 0
        );
        Long existingRevision = revisionForChange(firstChangeId);
        if (existingRevision != null) return existingRevision;
        long revision = currentRevisionByKey(workspaceKey) + 1L;
        Instant now = clock.instant();
        jdbcTemplate.update("""
                INSERT INTO workspace_revision(workspace_key, revision, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(workspace_key) DO UPDATE SET
                    revision = excluded.revision,
                    updated_at = excluded.updated_at
                """, workspaceKey, revision, now.toString());

        int patchBudget = MAX_TOTAL_PATCH_CHARS;
        for (int index = 0; index < changes.size(); index++) {
            Map<String, Object> change = changes.get(index);
            String path = text(change, "path");
            String rawPatch = text(change, "patch");
            String patch = rawPatch.substring(
                    0, Math.min(rawPatch.length(), Math.max(0, patchBudget))
            );
            patchBudget -= patch.length();
            boolean truncated = bool(change, "truncated")
                    || patch.length() < rawPatch.length()
                    || bool(event.getMetadata(), "workspaceChangesTruncated");
            String changeId = changeId(
                    run.getRunId(), valueOrEmpty(event.getToolCallId()),
                    change, index
            );
            jdbcTemplate.update("""
                    INSERT OR IGNORE INTO workspace_change_event(
                        change_id, workspace_key, repository_root,
                        workspace_path, task_id, run_id, tool_call_id,
                        agent_id, path, operation, previous_path,
                        before_hash, after_hash, before_blob, after_blob,
                        before_content, after_content,
                        patch, patch_truncated,
                        binary, additions, deletions, revision, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    changeId, workspaceKey,
                    repositoryRoot, workspacePath, run.getTaskId(),
                    run.getRunId(), valueOrEmpty(event.getToolCallId()),
                    text(change, "agentId"), path,
                    firstText(text(change, "operation"), "MODIFIED"),
                    text(change, "previousPath"),
                    text(change, "beforeHash"), text(change, "afterHash"),
                    text(change, "beforeBlob"), text(change, "afterBlob"),
                    text(change, "beforeContent"),
                    text(change, "afterContent"),
                    patch, truncated ? 1 : 0,
                    bool(change, "binary") ? 1 : 0,
                    integer(change, "additions"),
                    integer(change, "deletions"), revision, now.toString()
            );
            keepBlob(repositoryRoot, run.getRunId(), changeId,
                    "before", text(change, "beforeBlob"));
            keepBlob(repositoryRoot, run.getRunId(), changeId,
                    "after", text(change, "afterBlob"));
        }
        return revision;
    }

    @Transactional
    public synchronized void beginRun(
            ConversationRun run,
            String repositoryRoot,
            String workspacePath
    ) {
        String key = workspaceKey(firstText(workspacePath, repositoryRoot));
        jdbcTemplate.update("""
                INSERT OR IGNORE INTO workspace_run_attribution(
                    run_id, task_id, workspace_key, repository_root,
                    workspace_path, before_revision, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """, run.getRunId(), run.getTaskId(), key,
                valueOrEmpty(repositoryRoot), valueOrEmpty(workspacePath),
                currentRevisionByKey(key), clock.instant().toString());
    }

    @Transactional
    public synchronized void completeRun(String runId) {
        RunAttribution attribution = attribution(runId);
        if (attribution == null) return;
        Instant now = clock.instant();
        jdbcTemplate.update("""
                UPDATE workspace_run_attribution
                SET after_revision = ?, completed_at = ?
                WHERE run_id = ?
                """, currentRevisionByKey(attribution.workspaceKey()),
                now.toString(), runId);
    }

    public boolean isAttributed(String runId) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM workspace_run_attribution WHERE run_id = ?",
                Integer.class, runId
        );
        return count != null && count > 0;
    }

    public RunAttribution attribution(String runId) {
        try {
            return jdbcTemplate.queryForObject("""
                    SELECT run_id, task_id, workspace_key, repository_root,
                           workspace_path, before_revision, after_revision,
                           changes_complete, incomplete_reason
                    FROM workspace_run_attribution WHERE run_id = ?
                    """, (row, ignored) -> new RunAttribution(
                    row.getString("run_id"), row.getString("task_id"),
                    row.getString("workspace_key"),
                    row.getString("repository_root"),
                    row.getString("workspace_path"),
                    row.getLong("before_revision"),
                    row.getObject("after_revision") == null
                            ? null : row.getLong("after_revision"),
                    row.getInt("changes_complete") != 0,
                    row.getString("incomplete_reason")
            ), runId);
        } catch (EmptyResultDataAccessException ignored) {
            return null;
        }
    }

    public long currentRevision(String workspacePath) {
        return currentRevisionByKey(workspaceKey(workspacePath));
    }

    public boolean isComplete(String runId) {
        RunAttribution attribution = attribution(runId);
        return attribution == null || attribution.changesComplete();
    }

    public String incompleteReason(String runId) {
        RunAttribution attribution = attribution(runId);
        return attribution == null || attribution.changesComplete()
                ? "" : valueOrEmpty(attribution.incompleteReason());
    }

    @Transactional
    public synchronized long advanceRevision(String workspacePath) {
        String key = workspaceKey(workspacePath);
        if (key.isBlank()) return 0L;
        long revision = currentRevisionByKey(key) + 1L;
        jdbcTemplate.update("""
                INSERT INTO workspace_revision(workspace_key, revision, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(workspace_key) DO UPDATE SET
                    revision = excluded.revision,
                    updated_at = excluded.updated_at
                """, key, revision, clock.instant().toString());
        return revision;
    }

    public List<OwnedWorkspaceChange> changesForRun(String runId) {
        if (runId == null || runId.isBlank()) return List.of();
        return jdbcTemplate.query("""
                SELECT workspace_key, repository_root, workspace_path,
                       task_id, run_id, tool_call_id, agent_id, path,
                       operation, previous_path, before_hash, after_hash,
                       before_blob, after_blob, before_content, after_content,
                       patch, patch_truncated,
                       binary, additions, deletions,
                       revision, created_at
                FROM workspace_change_event
                WHERE run_id = ?
                ORDER BY revision ASC, created_at ASC, path ASC
                """, (row, ignored) -> new OwnedWorkspaceChange(
                row.getString("workspace_key"),
                row.getString("repository_root"),
                row.getString("workspace_path"),
                row.getString("task_id"), row.getString("run_id"),
                row.getString("tool_call_id"), row.getString("agent_id"),
                row.getString("path"), row.getString("operation"),
                row.getString("previous_path"),
                row.getString("before_hash"), row.getString("after_hash"),
                row.getString("before_blob"), row.getString("after_blob"),
                row.getString("before_content"),
                row.getString("after_content"),
                row.getString("patch"),
                row.getInt("patch_truncated") != 0,
                row.getInt("binary") != 0,
                row.getInt("additions"), row.getInt("deletions"),
                row.getLong("revision"),
                Instant.parse(row.getString("created_at"))
        ), runId);
    }

    /** Groups direct publications without ever diffing unrelated workspace state. */
    public List<OwnedWorkspaceChange> latestPerPath(String runId) {
        Map<String, OwnedWorkspaceChange> result = new LinkedHashMap<>();
        for (OwnedWorkspaceChange change : changesForRun(runId)) {
            result.put(change.path(), change);
        }
        return List.copyOf(result.values());
    }

    public boolean hasChanges(String runId) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM workspace_change_event WHERE run_id = ?",
                Integer.class, runId
        );
        return count != null && count > 0;
    }

    public boolean hasLaterForeignChange(
            String workspaceKey,
            String runId,
            String path,
            long revision
    ) {
        Integer count = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM workspace_change_event
                WHERE workspace_key = ? AND run_id <> ? AND revision > ?
                  AND (path = ? OR previous_path = ?)
                """, Integer.class, workspaceKey, runId, revision, path, path);
        return count != null && count > 0;
    }

    public boolean hasForeignChangeBetween(
            String workspaceKey,
            String runId,
            String path,
            long firstRevision,
            long lastRevision
    ) {
        if (lastRevision <= firstRevision) return false;
        Integer count = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM workspace_change_event
                WHERE workspace_key = ? AND run_id <> ?
                  AND revision > ? AND revision < ?
                  AND (path = ? OR previous_path = ?)
                """, Integer.class, workspaceKey, runId,
                firstRevision, lastRevision, path, path);
        return count != null && count > 0;
    }

    private long currentRevisionByKey(String workspaceKey) {
        if (workspaceKey.isBlank()) return 0L;
        try {
            Long result = jdbcTemplate.queryForObject(
                    "SELECT revision FROM workspace_revision WHERE workspace_key = ?",
                    Long.class, workspaceKey
            );
            return result == null ? 0L : result;
        } catch (EmptyResultDataAccessException ignored) {
            return 0L;
        }
    }

    private Long revisionForChange(String changeId) {
        try {
            return jdbcTemplate.queryForObject(
                    "SELECT revision FROM workspace_change_event WHERE change_id = ?",
                    Long.class, changeId
            );
        } catch (EmptyResultDataAccessException ignored) {
            return null;
        }
    }

    private void markIncomplete(String runId, String reason) {
        jdbcTemplate.update("""
                UPDATE workspace_run_attribution
                SET changes_complete = 0, incomplete_reason = ?
                WHERE run_id = ?
                """, valueOrEmpty(reason), runId);
    }

    private String changeId(
            String runId,
            String toolCallId,
            Map<String, Object> change,
            int ordinal
    ) {
        String signature = String.join("\u0000",
                valueOrEmpty(runId), valueOrEmpty(toolCallId),
                String.valueOf(ordinal),
                text(change, "path"), text(change, "previousPath"),
                text(change, "beforeHash"), text(change, "afterHash"));
        return UUID.nameUUIDFromBytes(
                signature.getBytes(StandardCharsets.UTF_8)
        ).toString();
    }

    private void keepBlob(
            String repositoryRoot,
            String runId,
            String changeId,
            String side,
            String blob
    ) {
        if (repositoryRoot == null || repositoryRoot.isBlank()
                || blob == null || !blob.matches("[0-9a-fA-F]{40,64}")) {
            return;
        }
        String safeRun = runId.replaceAll("[^A-Za-z0-9._-]", "-");
        String ref = "refs/lumora/workspace-events/" + safeRun + "/"
                + changeId + "/" + side;
        try {
            Process process = new ProcessBuilder(
                    "git", "-C", repositoryRoot,
                    "update-ref", ref, blob
            ).redirectErrorStream(true).start();
            if (!process.waitFor(15, java.util.concurrent.TimeUnit.SECONDS)
                    || process.exitValue() != 0) {
                process.destroyForcibly();
                LOGGER.warn("Unable to retain workspace blob {} for run {}",
                        blob, runId);
            }
        } catch (Exception error) {
            if (error instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            LOGGER.warn("Unable to retain workspace blob for run {}", runId,
                    error);
        }
    }

    private String workspaceKey(String value) {
        if (value == null || value.isBlank()) return "";
        Path path = Path.of(value).toAbsolutePath().normalize();
        try {
            if (Files.exists(path)) path = path.toRealPath();
        } catch (IOException ignored) {
            // A deleted Worktree still needs its stable normalized key.
        }
        String result = path.toString();
        return System.getProperty("os.name", "").toLowerCase(Locale.ROOT)
                .contains("win") ? result.toLowerCase(Locale.ROOT) : result;
    }

    private static List<Map<String, Object>> maps(Object value) {
        if (!(value instanceof Iterable<?> iterable)) return List.of();
        List<Map<String, Object>> result = new ArrayList<>();
        for (Object item : iterable) {
            if (!(item instanceof Map<?, ?> raw)) continue;
            Map<String, Object> converted = new LinkedHashMap<>();
            raw.forEach((key, entry) -> converted.put(String.valueOf(key), entry));
            result.add(converted);
        }
        return result;
    }

    private static String text(Map<String, ?> values, String key) {
        Object value = values.get(key);
        return value == null ? "" : String.valueOf(value).trim();
    }

    private static boolean bool(Map<String, ?> values, String key) {
        Object value = values.get(key);
        return value instanceof Boolean booleanValue
                ? booleanValue : "true".equalsIgnoreCase(String.valueOf(value));
    }

    private static int integer(Map<String, ?> values, String key) {
        Object value = values.get(key);
        if (value instanceof Number number) return number.intValue();
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }

    private static boolean hasWriteResourceAccess(Map<String, ?> metadata) {
        Object value = metadata.get("resourceAccess");
        if (!(value instanceof Iterable<?> accesses)) return false;
        for (Object access : accesses) {
            if (access instanceof Map<?, ?> map
                    && "write".equalsIgnoreCase(String.valueOf(
                    map.get("mode")
            ))) {
                return true;
            }
        }
        return false;
    }

    private static String firstText(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    private static String valueOrEmpty(String value) {
        return value == null ? "" : value.trim();
    }

    public record OwnedWorkspaceChange(
            String workspaceKey,
            String repositoryRoot,
            String workspacePath,
            String taskId,
            String runId,
            String toolCallId,
            String agentId,
            String path,
            String operation,
            String previousPath,
            String beforeHash,
            String afterHash,
            String beforeBlob,
            String afterBlob,
            String beforeContent,
            String afterContent,
            String patch,
            boolean patchTruncated,
            boolean binary,
            int additions,
            int deletions,
            long revision,
            Instant createdAt
    ) {
    }

    public record RunAttribution(
            String runId,
            String taskId,
            String workspaceKey,
            String repositoryRoot,
            String workspacePath,
            long beforeRevision,
            Long afterRevision,
            boolean changesComplete,
            String incompleteReason
    ) {
    }
}
