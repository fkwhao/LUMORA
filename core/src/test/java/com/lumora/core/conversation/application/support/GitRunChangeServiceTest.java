package com.lumora.core.conversation.application.support;

import com.lumora.core.conversation.api.dto.response.ConversationRunChangesResponse;
import com.lumora.core.conversation.domain.entity.ConversationRun;
import com.lumora.core.conversation.domain.entity.ConversationRunChangeSet;
import com.lumora.core.conversation.domain.model.ChatStreamEvent;
import com.lumora.core.conversation.domain.model.ChatStreamEventType;
import com.lumora.core.conversation.infrastructure.persistence.ConversationRunChangeSetMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class GitRunChangeServiceTest {

    @TempDir
    Path repository;

    @Test
    void capturesDirtyBaselineAndRestoresModifiedAndUntrackedFiles()
            throws IOException {
        git("init");
        Files.writeString(repository.resolve("existing.txt"), "before\n");
        GitRunChangeService service = service();
        ConversationRun run = run("run-1");

        service.begin(run);
        Files.writeString(repository.resolve("existing.txt"), "after\n");
        Files.writeString(repository.resolve("created.txt"), "created\n");
        service.captureTerminal(run);

        ConversationRunChangesResponse changes = service.changes(
                "task-1", "run-1"
        );
        assertThat(changes.revertible()).isTrue();
        assertThat(changes.files()).extracting("path")
                .containsExactlyInAnyOrder("existing.txt", "created.txt");

        service.revert("task-1", "run-1");
        assertThat(Files.readString(repository.resolve("existing.txt")))
                .isEqualTo("before\n");
        assertThat(repository.resolve("created.txt")).doesNotExist();
    }

    @Test
    void disablesAutomaticRevertWhenTheRealIndexChanges()
            throws IOException {
        git("init");
        Files.writeString(repository.resolve("existing.txt"), "before\n");
        GitRunChangeService service = service();
        ConversationRun run = run("run-2");

        service.begin(run);
        Files.writeString(repository.resolve("existing.txt"), "after\n");
        git("add", "existing.txt");
        service.captureTerminal(run);

        ConversationRunChangesResponse changes = service.changes(
                "task-1", "run-2"
        );
        assertThat(changes.revertible()).isFalse();
        assertThat(changes.reason()).contains("暂存区");
    }

    @Test
    void refusesToOverwriteAnIgnoredFileAtADeletedPath() throws IOException {
        git("init");
        Files.writeString(repository.resolve(".gitignore"), "deleted.txt\n");
        Files.writeString(repository.resolve("deleted.txt"), "before\n");
        git("add", ".gitignore");
        git("add", "--force", "deleted.txt");
        GitRunChangeService service = service();
        ConversationRun run = run("run-3");

        service.begin(run);
        Files.delete(repository.resolve("deleted.txt"));
        service.captureTerminal(run);
        Files.writeString(repository.resolve("deleted.txt"), "later\n");

        assertThatThrownBy(() -> service.revert("task-1", "run-3"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("拒绝自动撤回");
        assertThat(Files.readString(repository.resolve("deleted.txt")))
                .isEqualTo("later\n");
    }

    @Test
    void keepsConcurrentLocalRunsTrackingWithoutCollision()
            throws IOException {
        git("init");
        GitRunChangeService service = service();
        ConversationRun first = run("run-4");
        ConversationRun second = run("run-5");

        service.begin(first);
        service.begin(second);

        assertThat(service.changes("task-1", "run-4").status())
                .isEqualTo("TRACKING");
        assertThat(service.changes("task-1", "run-5").status())
                .isEqualTo("TRACKING");
        assertThat(service.changes("task-1", "run-4").revertible())
                .isFalse();

        service.captureTerminal(first);
        assertThat(service.changes("task-1", "run-4").status())
                .isEqualTo("CAPTURED");
        service.captureTerminal(second);
        assertThat(service.changes("task-1", "run-5").status())
                .isEqualTo("CAPTURED");
    }

    @Test
    void refusesEmptyAttributionWhenTheGitCheckpointChanged()
            throws IOException {
        git("init");
        Path target = repository.resolve("value.txt");
        Files.writeString(target, "before\n");
        WorkspaceChangeLedgerService ledger = ledger();
        GitRunChangeService service = service(ledger);
        ConversationRun run = run("run-missing-event");

        service.begin(run);
        Files.writeString(target, "after\n");
        service.captureTerminal(run);

        ConversationRunChangesResponse changes = service.changes(
                "task-1", run.getRunId()
        );
        assertThat(changes.status()).isEqualTo("COLLIDED");
        assertThat(changes.files()).extracting("path")
                .containsExactly("value.txt");
        assertThat(changes.revertible()).isFalse();
        assertThat(changes.reason()).contains("Checkpoint");
        assertThatThrownBy(() -> service.revert("task-1", run.getRunId()))
                .hasMessageContaining("Checkpoint");
        assertThat(Files.readString(target)).isEqualTo("after\n");
    }

    @Test
    void refusesRevertWhileAnotherRunOwnsTheRepositoryLease()
            throws IOException {
        git("init");
        Files.writeString(repository.resolve("existing.txt"), "before\n");
        GitRunChangeService service = service();
        ConversationRun completed = run("run-6");
        service.begin(completed);
        Files.writeString(repository.resolve("existing.txt"), "after\n");
        service.captureTerminal(completed);

        service.begin(run("run-7"));

        assertThatThrownBy(() -> service.revert("task-1", "run-6"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("其他活动 Run");
        assertThat(Files.readString(repository.resolve("existing.txt")))
                .isEqualTo("after\n");
    }

    @Test
    void refusesRevertWhenThePublishedFileSetWasTruncated()
            throws IOException {
        git("init");
        Files.writeString(repository.resolve("value.txt"), "before\n");
        String beforeBlob = git("hash-object", "-w", "value.txt");
        WorkspaceChangeLedgerService ledger = ledger();
        GitRunChangeService service = service(ledger);
        ConversationRun run = run("run-truncated");
        service.begin(run);
        Files.writeString(repository.resolve("value.txt"), "after\n");
        String afterBlob = git("hash-object", "-w", "value.txt");
        ChatStreamEvent event = new ChatStreamEvent(
                ChatStreamEventType.TOOL_COMPLETED,
                "", "", null, "", "item", "tool-1", "shell_command",
                "", Map.of(), "", 0L, null,
                Map.of(
                        "workspaceChangeSetComplete", false,
                        "workspaceChanges", List.of(Map.of(
                                "repositoryRoot", repository.toString(),
                                "path", "value.txt",
                                "operation", "MODIFIED",
                                "beforeHash", beforeBlob,
                                "afterHash", afterBlob,
                                "beforeBlob", beforeBlob,
                                "afterBlob", afterBlob
                        ))
                )
        );
        ledger.project(run, event);
        service.captureTerminal(run);

        ConversationRunChangesResponse changes = service.changes(
                "task-1", "run-truncated"
        );
        assertThat(changes.revertible()).isFalse();
        assertThat(changes.reason()).contains("追踪上限");
        assertThatThrownBy(() -> service.revert(
                "task-1", "run-truncated"
        )).hasMessageContaining("追踪上限");
        assertThat(Files.readString(repository.resolve("value.txt")))
                .isEqualTo("after\n");
    }

    @Test
    void previewsAndRevertsAttributedNonGitFileContent() throws IOException {
        Path target = repository.resolve("value.txt");
        byte[] before = "before\n".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        byte[] after = "after\n".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        Files.write(target, before);
        WorkspaceChangeLedgerService ledger = ledger();
        GitRunChangeService service = service(ledger);
        ConversationRun run = run("run-non-git");
        service.begin(run);
        Files.write(target, after);
        ledger.project(run, new ChatStreamEvent(
                ChatStreamEventType.TOOL_COMPLETED,
                "", "", null, "", "item", "tool-non-git", "write_file",
                "", Map.of(), "", 0L, null,
                Map.of(
                        "workspaceChangeSetComplete", true,
                        "workspaceChanges", List.of(Map.ofEntries(
                                Map.entry("repositoryRoot", ""),
                                Map.entry("path", "value.txt"),
                                Map.entry("operation", "MODIFIED"),
                                Map.entry("beforeHash", sha256(before)),
                                Map.entry("afterHash", sha256(after)),
                                Map.entry("beforeBlob", ""),
                                Map.entry("afterBlob", ""),
                                Map.entry("beforeContent", Base64.getEncoder()
                                        .encodeToString(before)),
                                Map.entry("afterContent", Base64.getEncoder()
                                        .encodeToString(after)),
                                Map.entry("patchTruncated", false)
                        ))
                )
        ));
        service.captureTerminal(run);

        ConversationRunChangesResponse changes = service.changes(
                "task-1", "run-non-git"
        );
        assertThat(changes.status()).isEqualTo("CAPTURED");
        assertThat(changes.revertible()).isTrue();
        assertThat(changes.files()).extracting("path")
                .containsExactly("value.txt");

        long beforeRevertRevision = ledger.currentRevision(
                repository.toString()
        );
        service.revert("task-1", "run-non-git");
        assertThat(Files.readAllBytes(target)).isEqualTo(before);
        assertThat(ledger.currentRevision(repository.toString()))
                .isEqualTo(beforeRevertRevision + 1L);
    }

    @Test
    void refusesEmptyNonGitAttributionWithoutZeroEffectEvidence() {
        WorkspaceChangeLedgerService ledger = ledger();
        GitRunChangeService service = service(ledger);
        ConversationRun run = run("run-non-git-empty");

        service.begin(run);
        service.captureTerminal(run);

        ConversationRunChangesResponse changes = service.changes(
                "task-1", run.getRunId()
        );
        assertThat(changes.files()).isEmpty();
        assertThat(changes.revertible()).isFalse();
        assertThatThrownBy(() -> service.revert("task-1", run.getRunId()))
                .hasMessageContaining("拒绝撤回");
    }

    @Test
    void interleavedRunPreviewContainsOnlyOwnedPublishedLines()
            throws IOException {
        git("init");
        Path target = repository.resolve("value.txt");
        Files.writeString(target, "base\n");
        String baseBlob = git("hash-object", "-w", "value.txt");
        WorkspaceChangeLedgerService ledger = ledger();
        GitRunChangeService service = service(ledger);
        ConversationRun first = run("run-interleave-a");
        ConversationRun foreign = run("run-interleave-b");
        service.begin(first);
        service.begin(foreign);

        Files.writeString(target, "A1_ONLY\n");
        String a1Blob = git("hash-object", "-w", "value.txt");
        ledger.project(first, changeEvent(
                "tool-a1", baseBlob, a1Blob,
                "@@ -1 +1 @@\n-base\n+A1_ONLY\n"
        ));

        Files.writeString(target, "A1_ONLY\nFOREIGN_B\n");
        String foreignBlob = git("hash-object", "-w", "value.txt");
        ledger.project(foreign, changeEvent(
                "tool-b", a1Blob, foreignBlob,
                "@@ -1 +1,2 @@\n A1_ONLY\n+FOREIGN_B\n"
        ));

        Files.writeString(target, "A1_ONLY\nFOREIGN_B\nA2_ONLY\n");
        String a2Blob = git("hash-object", "-w", "value.txt");
        ledger.project(first, changeEvent(
                "tool-a2", foreignBlob, a2Blob,
                "@@ -1,2 +1,3 @@\n A1_ONLY\n FOREIGN_B\n+A2_ONLY\n"
        ));
        service.captureTerminal(first);
        service.captureTerminal(foreign);

        ConversationRunChangesResponse changes = service.changes(
                "task-1", first.getRunId()
        );
        assertThat(changes.revertible()).isFalse();
        assertThat(changes.reason()).contains("交错修改");
        assertThat(changes.additions()).isEqualTo(2);
        assertThat(changes.deletions()).isEqualTo(1);
        assertThat(changes.files().getFirst().patch())
                .contains("A1_ONLY", "A2_ONLY")
                .doesNotContain("FOREIGN_B");
    }

    private ChatStreamEvent changeEvent(
            String toolCallId,
            String beforeBlob,
            String afterBlob,
            String patch
    ) {
        int additions = (int) patch.lines()
                .filter(line -> line.startsWith("+")
                        && !line.startsWith("+++"))
                .count();
        int deletions = (int) patch.lines()
                .filter(line -> line.startsWith("-")
                        && !line.startsWith("---"))
                .count();
        return new ChatStreamEvent(
                ChatStreamEventType.TOOL_COMPLETED,
                "", "", null, "", "item", toolCallId, "write_file",
                "", Map.of(), "", 0L, null,
                Map.of(
                        "workspaceChangeSetComplete", true,
                        "workspaceChanges", List.of(Map.ofEntries(
                                Map.entry("repositoryRoot",
                                        repository.toString()),
                                Map.entry("path", "value.txt"),
                                Map.entry("operation", "MODIFIED"),
                                Map.entry("beforeHash", beforeBlob),
                                Map.entry("afterHash", afterBlob),
                                Map.entry("beforeBlob", beforeBlob),
                                Map.entry("afterBlob", afterBlob),
                                Map.entry("patch", patch),
                                Map.entry("additions", additions),
                                Map.entry("deletions", deletions),
                                Map.entry("truncated", false)
                        ))
                )
        );
    }

    private GitRunChangeService service() {
        return service(null);
    }

    private GitRunChangeService service(
            WorkspaceChangeLedgerService ledger
    ) {
        ConversationRunChangeSetMapper mapper = mock(
                ConversationRunChangeSetMapper.class
        );
        Map<String, ConversationRunChangeSet> records = new LinkedHashMap<>();
        when(mapper.selectById(any())).thenAnswer(invocation ->
                records.get(invocation.<String>getArgument(0)));
        when(mapper.selectList(any())).thenAnswer(invocation ->
                records.values().stream().toList());
        when(mapper.insert(any(ConversationRunChangeSet.class)))
                .thenAnswer(invocation -> {
            ConversationRunChangeSet value = invocation.getArgument(0);
            records.put(value.getRunId(), value);
            return 1;
        });
        when(mapper.updateById(any(ConversationRunChangeSet.class)))
                .thenAnswer(invocation -> {
            ConversationRunChangeSet value = invocation.getArgument(0);
            records.put(value.getRunId(), value);
            return 1;
        });
        Clock clock = Clock.fixed(
                Instant.parse("2026-08-22T00:00:00Z"), ZoneOffset.UTC
        );
        return ledger == null
                ? new GitRunChangeService(mapper, clock)
                : new GitRunChangeService(mapper, clock, ledger);
    }

    private WorkspaceChangeLedgerService ledger() {
        SingleConnectionDataSource dataSource = new SingleConnectionDataSource(
                "jdbc:sqlite::memory:", true
        );
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("""
                CREATE TABLE workspace_revision (
                    workspace_key TEXT PRIMARY KEY,
                    revision INTEGER NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """);
        jdbc.execute("""
                CREATE TABLE workspace_run_attribution (
                    run_id TEXT PRIMARY KEY, task_id TEXT NOT NULL,
                    workspace_key TEXT NOT NULL, repository_root TEXT NOT NULL,
                    workspace_path TEXT NOT NULL,
                    before_revision INTEGER NOT NULL, after_revision INTEGER,
                    changes_complete INTEGER NOT NULL DEFAULT 1,
                    incomplete_reason TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL, completed_at TEXT
                )
                """);
        jdbc.execute("""
                CREATE TABLE workspace_change_event (
                    change_id TEXT PRIMARY KEY, workspace_key TEXT NOT NULL,
                    repository_root TEXT NOT NULL, workspace_path TEXT NOT NULL,
                    task_id TEXT NOT NULL, run_id TEXT NOT NULL,
                    tool_call_id TEXT NOT NULL, agent_id TEXT NOT NULL,
                    path TEXT NOT NULL, operation TEXT NOT NULL,
                    previous_path TEXT NOT NULL, before_hash TEXT NOT NULL,
                    after_hash TEXT NOT NULL, before_blob TEXT NOT NULL,
                    after_blob TEXT NOT NULL, before_content TEXT NOT NULL,
                    after_content TEXT NOT NULL, patch TEXT NOT NULL,
                    patch_truncated INTEGER NOT NULL, binary INTEGER NOT NULL,
                    additions INTEGER NOT NULL, deletions INTEGER NOT NULL,
                    revision INTEGER NOT NULL, created_at TEXT NOT NULL
                )
                """);
        return new WorkspaceChangeLedgerService(
                jdbc,
                Clock.fixed(
                        Instant.parse("2026-08-22T00:00:00Z"),
                        ZoneOffset.UTC
                )
        );
    }

    private ConversationRun run(String runId) {
        ConversationRun run = new ConversationRun();
        run.setRunId(runId);
        run.setTaskId("task-1");
        run.setWorkspacePath(repository.toString());
        return run;
    }

    private String sha256(byte[] content) {
        try {
            return HexFormat.of().formatHex(
                    java.security.MessageDigest.getInstance("SHA-256")
                            .digest(content)
            );
        } catch (java.security.NoSuchAlgorithmException error) {
            throw new IllegalStateException(error);
        }
    }

    private String git(String... arguments) throws IOException {
        String[] command = new String[arguments.length + 3];
        command[0] = "git";
        command[1] = "-C";
        command[2] = repository.toString();
        System.arraycopy(arguments, 0, command, 3, arguments.length);
        Process process = new ProcessBuilder(command)
                .redirectErrorStream(true)
                .start();
        try {
            byte[] output = process.getInputStream().readAllBytes();
            int exitCode = process.waitFor();
            assertThat(exitCode)
                    .withFailMessage(new String(output))
                    .isZero();
            return new String(output).lines()
                    .filter(line -> !line.isBlank())
                    .reduce((first, second) -> second)
                    .orElse("")
                    .trim();
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(error);
        }
    }
}
