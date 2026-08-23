package com.lumora.core.task.application.support;

import com.lumora.core.conversation.application.support.WorkspaceChangeLedgerService;
import com.lumora.core.conversation.domain.entity.ConversationRun;
import com.lumora.core.conversation.infrastructure.persistence.ConversationRunMapper;
import com.lumora.core.shared.infrastructure.git.GitWorkspaceMutationGate;
import com.lumora.core.shared.infrastructure.git.GitWorkspaceOperations;
import com.lumora.core.task.api.dto.response.TaskWorktreeResponse;
import com.lumora.core.task.domain.entity.AgentTask;
import com.lumora.core.task.domain.entity.TaskWorktree;
import com.lumora.core.task.infrastructure.persistence.TaskMapper;
import com.lumora.core.task.infrastructure.persistence.TaskWorktreeMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TaskWorktreeServiceTest {

    @TempDir
    Path temporaryDirectory;

    @Test
    void isolatesAConcurrentTaskAndAppliesItsResultWithAThreeWayMerge()
            throws IOException, InterruptedException {
        Path repository = createRepository();
        Fixture fixture = fixture();
        ConversationRun localRun = run("task-local", repository);
        ConversationRun isolatedRun = run("task-isolated", repository);

        assertThat(fixture.service().acquireForRun(localRun))
                .isEqualTo(repository.toString());
        selectWorktree(fixture, isolatedRun);
        Path isolated = Path.of(
                fixture.service().acquireForRun(isolatedRun)
        );
        assertThat(isolated).isNotEqualTo(repository);
        assertThat(Files.readString(isolated.resolve("isolated.txt")))
                .isEqualTo("base\n");

        Files.writeString(
                isolated.resolve("isolated.txt"), "worktree\n",
                StandardCharsets.UTF_8
        );
        Files.writeString(
                repository.resolve("local.txt"), "local\n",
                StandardCharsets.UTF_8
        );
        fixture.service().onRunTerminal(isolatedRun);
        fixture.service().onRunTerminal(localRun);

        TaskWorktreeResponse waiting = fixture.service().status(
                "task-isolated"
        );
        assertThat(waiting.worktreeState()).isEqualTo("WAITING_REVIEW");
        TaskWorktreeService.ChangeRange changes = fixture.service()
                .changeRange("task-isolated");
        assertThat(changes).isNotNull();
        assertThat(changes.beforeTree()).isNotEqualTo(changes.afterTree());
        assertThat(Files.readString(repository.resolve("isolated.txt")))
                .isEqualTo("base\n");

        TaskWorktreeResponse applied = fixture.service().apply(
                "task-isolated"
        );

        assertThat(applied.worktreeState()).isEqualTo("REMOVED");
        assertThat(Files.readString(repository.resolve("isolated.txt")))
                .isEqualTo("worktree\n");
        assertThat(Files.readString(repository.resolve("local.txt")))
                .isEqualTo("local\n");
        assertThat(isolated).doesNotExist();
        verify(fixture.ledger()).advanceRevision(repository.toString());
    }

    @Test
    void isolatesAndAppliesAConcurrentTaskBeforeTheFirstCommit()
            throws IOException, InterruptedException {
        Path repository = createUnbornRepository();
        Fixture fixture = fixture();
        ConversationRun isolatedRun = run("task-isolated", repository);

        selectWorktree(fixture, isolatedRun);
        Path isolated = Path.of(
                fixture.service().acquireForRun(isolatedRun)
        );
        assertThat(Files.readString(isolated.resolve("isolated.txt")))
                .isEqualTo("base\n");

        Files.writeString(
                isolated.resolve("isolated.txt"), "worktree\n",
                StandardCharsets.UTF_8
        );
        Files.writeString(
                repository.resolve("local.txt"), "local\n",
                StandardCharsets.UTF_8
        );
        fixture.service().onRunTerminal(isolatedRun);

        TaskWorktreeResponse applied = fixture.service().apply(
                "task-isolated"
        );

        assertThat(applied.worktreeState()).isEqualTo("REMOVED");
        assertThat(Files.readString(repository.resolve("isolated.txt")))
                .isEqualTo("worktree\n");
        assertThat(Files.readString(repository.resolve("local.txt")))
                .isEqualTo("local\n");
        assertThat(hasHead(repository)).isFalse();
        assertThat(isolated).doesNotExist();
    }

    @Test
    void createsARealUnbornBranchWithoutExposingTheSyntheticBaseline()
            throws IOException, InterruptedException {
        Path repository = createUnbornRepository();
        Fixture fixture = fixture();
        ConversationRun isolatedRun = run("task-isolated", repository);
        selectWorktree(fixture, isolatedRun);
        Path isolated = Path.of(
                fixture.service().acquireForRun(isolatedRun)
        );
        Files.writeString(
                isolated.resolve("isolated.txt"), "worktree\n",
                StandardCharsets.UTF_8
        );
        fixture.service().onRunTerminal(isolatedRun);

        TaskWorktreeResponse branched = fixture.service().createBranch(
                "task-isolated", "agent/unborn-result"
        );

        assertThat(branched.worktreeState()).isEqualTo("BRANCHED");
        assertThat(branched.branchName()).isEqualTo("agent/unborn-result");
        assertThat(hasHead(isolated)).isFalse();
        assertThat(gitOutput(
                isolated, "symbolic-ref", "--short", "HEAD"
        )).isEqualTo("agent/unborn-result");
        assertThat(gitOutput(isolated, "status", "--porcelain"))
                .contains("isolated.txt");
        assertThat(hasHead(repository)).isFalse();
        verify(fixture.ledger()).advanceRevision(isolated.toString());
    }

    @Test
    void preservesBothSidesWhenTheThreeWayMergeConflicts()
            throws IOException, InterruptedException {
        Path repository = createRepository();
        Fixture fixture = fixture();
        ConversationRun localRun = run("task-local", repository);
        ConversationRun isolatedRun = run("task-isolated", repository);
        fixture.service().acquireForRun(localRun);
        selectWorktree(fixture, isolatedRun);
        Path isolated = Path.of(
                fixture.service().acquireForRun(isolatedRun)
        );

        Files.writeString(
                repository.resolve("shared.txt"), "local side\n",
                StandardCharsets.UTF_8
        );
        Files.writeString(
                isolated.resolve("shared.txt"), "worktree side\n",
                StandardCharsets.UTF_8
        );
        fixture.service().onRunTerminal(isolatedRun);
        fixture.service().onRunTerminal(localRun);

        TaskWorktreeResponse result = fixture.service().apply(
                "task-isolated"
        );

        assertThat(result.worktreeState()).isEqualTo("CONFLICTED");
        assertThat(result.conflictPaths()).contains("shared.txt");
        assertThat(Files.readString(repository.resolve("shared.txt")))
                .isEqualTo("local side\n");
        assertThat(Files.readString(isolated.resolve("shared.txt")))
                .isEqualTo("worktree side\n");
        assertThat(isolated).exists();

        TaskWorktreeResponse discarded = fixture.service().discard(
                "task-isolated"
        );
        assertThat(discarded.worktreeState()).isEqualTo("REMOVED");
        assertThat(isolated).doesNotExist();
    }

    @Test
    void keepsTerminalCleanupIdempotentForAnUnchangedWorktree()
            throws IOException, InterruptedException {
        Path repository = createRepository();
        Fixture fixture = fixture();
        fixture.service().acquireForRun(run("task-local", repository));
        ConversationRun isolatedRun = run("task-isolated", repository);
        selectWorktree(fixture, isolatedRun);
        Path isolated = Path.of(
                fixture.service().acquireForRun(isolatedRun)
        );

        fixture.service().onRunTerminal(isolatedRun);
        fixture.service().onRunTerminal(isolatedRun);

        assertThat(fixture.service().status("task-isolated")
                .worktreeState()).isEqualTo("REMOVED");
        assertThat(isolated).doesNotExist();
    }

    @Test
    void preservesASubdirectoryWorkspaceDuringRestartRecovery()
            throws IOException, InterruptedException {
        Path repository = createRepository();
        Path nested = repository.resolve("nested");
        Files.createDirectories(nested);
        Fixture fixture = fixture();
        fixture.service().acquireForRun(run("task-local", repository));
        ConversationRun isolatedRun = run("task-isolated", nested);
        selectWorktree(fixture, isolatedRun);
        Path isolatedWorkspace = Path.of(
                fixture.service().acquireForRun(isolatedRun)
        );
        Files.writeString(
                isolatedWorkspace.resolve("result.txt"), "isolated\n",
                StandardCharsets.UTF_8
        );
        fixture.service().onRunTerminal(isolatedRun);

        fixture.service().recoverAfterRestart(Set.of("task-isolated"));

        assertThat(fixture.service().status("task-isolated")
                .effectiveWorkspacePath()).isEqualTo(
                isolatedWorkspace.toString()
        );
        fixture.service().discard("task-isolated");
    }

    @Test
    void preservesIgnoredPhysicalEffectsInsteadOfCleaningTheWorktree()
            throws IOException, InterruptedException {
        Path repository = createRepository();
        Files.writeString(repository.resolve(".gitignore"), "ignored/\n");
        git(repository, "add", ".gitignore");
        git(repository, "-c", "user.name=Lumora Test",
                "-c", "user.email=lumora@test.invalid",
                "commit", "-m", "ignore generated files");
        Fixture fixture = fixture();
        ConversationRun isolatedRun = run("task-ignored", repository);
        selectWorktree(fixture, isolatedRun);
        Path isolated = Path.of(fixture.service().acquireForRun(isolatedRun));
        Files.createDirectories(isolated.resolve("ignored"));
        Files.writeString(
                isolated.resolve("ignored/cache.bin"), "important\n",
                StandardCharsets.UTF_8
        );

        fixture.service().onRunTerminal(isolatedRun);

        TaskWorktreeResponse waiting = fixture.service().status("task-ignored");
        assertThat(waiting.worktreeState()).isEqualTo("WAITING_REVIEW");
        assertThat(waiting.reason()).contains("Git 忽略");
        assertThat(isolated.resolve("ignored/cache.bin")).exists();
        assertThatThrownBy(() -> fixture.service().apply("task-ignored"))
                .hasMessageContaining("Git 忽略");
        assertThatThrownBy(() -> fixture.service().createBranch(
                "task-ignored", "agent/ignored"
        )).hasMessageContaining("Git 忽略");

        fixture.service().discard("task-ignored");
        assertThat(isolated).doesNotExist();
    }

    @Test
    void applyDoesNotOverwriteLocalIgnoredPhysicalFile()
            throws IOException, InterruptedException {
        Path repository = createRepository();
        Files.writeString(repository.resolve(".gitignore"), ".env\n");
        git(repository, "add", ".gitignore");
        git(repository, "-c", "user.name=Lumora Test",
                "-c", "user.email=lumora@test.invalid",
                "commit", "-m", "ignore env");
        Files.writeString(repository.resolve(".env"), "LOCAL_SECRET\n");
        Fixture fixture = fixture();
        ConversationRun isolatedRun = run("task-local-secret", repository);
        selectWorktree(fixture, isolatedRun);
        Path isolated = Path.of(
                fixture.service().acquireForRun(isolatedRun)
        );
        Files.writeString(isolated.resolve(".gitignore"), "");
        Files.writeString(isolated.resolve(".env"), "WORKTREE_VALUE\n");
        fixture.service().onRunTerminal(isolatedRun);

        TaskWorktreeResponse response = fixture.service().apply(
                isolatedRun.getTaskId()
        );

        assertThat(response.worktreeState()).isEqualTo("CONFLICTED");
        assertThat(response.reason()).contains("忽略文件", ".env");
        assertThat(Files.readString(repository.resolve(".env")))
                .isEqualTo("LOCAL_SECRET\n");
        assertThat(isolated).exists();
    }

    @Test
    void retainedBranchSurvivesHandoffToLocalAndRestartRecovery()
            throws IOException, InterruptedException {
        Path repository = createRepository();
        Fixture fixture = fixture();
        ConversationRun isolatedRun = run("task-branch", repository);
        selectWorktree(fixture, isolatedRun);
        Path isolated = Path.of(fixture.service().acquireForRun(isolatedRun));
        Files.writeString(
                isolated.resolve("result.txt"), "branch result\n",
                StandardCharsets.UTF_8
        );
        fixture.service().onRunTerminal(isolatedRun);
        fixture.service().createBranch("task-branch", "agent/retained");

        TaskWorktreeResponse local = fixture.service().handoff(
                "task-branch", repository.toString(), "LOCAL", ""
        );
        assertThat(local.workspaceMode()).isEqualTo("LOCAL");
        fixture.service().recoverAfterRestart(Set.of("task-branch"));

        assertThat(fixture.service().status("task-branch").workspaceMode())
                .isEqualTo("LOCAL");
        assertThat(isolated).exists();
        assertThat(gitOutput(isolated, "symbolic-ref", "--short", "HEAD"))
                .isEqualTo("agent/retained");
    }

    @Test
    void adoptedExistingWorktreeIsNeverDeletedByDiscardOrRecovery()
            throws IOException, InterruptedException {
        Path repository = createRepository();
        Path external = temporaryDirectory.resolve("user-owned-worktree")
                .toAbsolutePath().normalize();
        git(repository, "worktree", "add", "-b", "user/existing",
                external.toString(), "HEAD");
        Fixture fixture = fixture();
        ConversationRun run = run("task-adopted", repository);
        TaskWorktreeResponse adopted = fixture.service().handoff(
                run.getTaskId(), repository.toString(),
                "EXISTING_WORKTREE", external.toString()
        );
        assertThat(adopted.managedByLumora()).isFalse();
        assertThat(adopted.canAutoApply()).isFalse();
        assertThat(adopted.autoApplyWhenClean()).isFalse();
        assertThat(Path.of(fixture.service().acquireForRun(run)))
                .isEqualTo(external);
        Files.writeString(external.resolve("isolated.txt"), "user result\n");
        fixture.service().onRunTerminal(run);

        assertThatThrownBy(() -> fixture.service().discard(run.getTaskId()))
                .hasMessageContaining("外部采用");
        fixture.service().recoverAfterRestart(Set.of());
        assertThat(external).exists();
        assertThat(gitOutput(external, "branch", "--show-current"))
                .isEqualTo("user/existing");

        fixture.service().handoff(
                run.getTaskId(), repository.toString(), "LOCAL", ""
        );
        fixture.service().recoverAfterRestart(Set.of());
        assertThat(external).exists();
        assertThat(fixture.service().status(run.getTaskId()).workspaceMode())
                .isEqualTo("LOCAL");
    }

    @Test
    void retainedFormalBranchesDoNotConsumeTemporaryCapacity()
            throws IOException, InterruptedException {
        Path repository = createRepository();
        Fixture fixture = fixture(1);
        ConversationRun first = run("task-formal", repository);
        selectWorktree(fixture, first);
        Path retained = Path.of(fixture.service().acquireForRun(first));
        Files.writeString(retained.resolve("isolated.txt"), "formal\n");
        fixture.service().onRunTerminal(first);
        fixture.service().createBranch("task-formal", "agent/formal");

        ConversationRun second = run("task-temporary", repository);
        selectWorktree(fixture, second);
        Path temporary = Path.of(fixture.service().acquireForRun(second));

        assertThat(temporary).exists();
        assertThat(retained).exists();
        fixture.service().onRunTerminal(second);
    }

    @Test
    void crashRecoveryPreservesIgnoredOnlyWorktreeEffects()
            throws IOException, InterruptedException {
        Path repository = createRepository();
        Files.writeString(repository.resolve(".gitignore"), "ignored/\n");
        git(repository, "add", ".gitignore");
        git(repository, "-c", "user.name=Lumora Test",
                "-c", "user.email=lumora@test.invalid",
                "commit", "-m", "ignore generated files");
        Fixture fixture = fixture();
        ConversationRun run = run("task-crash-ignored", repository);
        selectWorktree(fixture, run);
        Path isolated = Path.of(fixture.service().acquireForRun(run));
        Files.createDirectories(isolated.resolve("ignored"));
        Files.writeString(
                isolated.resolve("ignored/recovery.bin"), "retain me\n",
                StandardCharsets.UTF_8
        );

        fixture.service().recoverAfterRestart(Set.of());

        TaskWorktreeResponse recovered = fixture.service().status(
                "task-crash-ignored"
        );
        assertThat(recovered.worktreeState()).isEqualTo("WAITING_REVIEW");
        assertThat(recovered.reason()).contains("Git 忽略");
        assertThat(isolated.resolve("ignored/recovery.bin")).exists();
        fixture.service().discard("task-crash-ignored");
    }

    private Fixture fixture() {
        return fixture(5);
    }

    private Fixture fixture(int maxRetained) {
        Map<String, TaskWorktree> rows = new LinkedHashMap<>();
        TaskWorktreeMapper mapper = mock(TaskWorktreeMapper.class);
        when(mapper.selectById(any())).thenAnswer(invocation ->
                rows.get(invocation.getArgument(0, String.class)));
        when(mapper.selectList(any())).thenAnswer(invocation ->
                rows.values().stream().toList());
        when(mapper.insert(any(TaskWorktree.class))).thenAnswer(invocation -> {
            TaskWorktree row = invocation.getArgument(0);
            rows.put(row.getTaskId(), row);
            return 1;
        });
        when(mapper.updateById(any(TaskWorktree.class))).thenAnswer(invocation -> {
            TaskWorktree row = invocation.getArgument(0);
            rows.put(row.getTaskId(), row);
            return 1;
        });
        TaskMapper taskMapper = mock(TaskMapper.class);
        when(taskMapper.selectById(any())).thenReturn(mock(AgentTask.class));
        ConversationRunMapper runMapper = mock(ConversationRunMapper.class);
        when(runMapper.selectList(any())).thenReturn(List.of());
        Clock clock = Clock.fixed(
                Instant.parse("2026-08-22T00:00:00Z"), ZoneOffset.UTC
        );
        WorkspaceChangeLedgerService ledger = mock(
                WorkspaceChangeLedgerService.class
        );
        TaskWorktreeService service = new TaskWorktreeService(
                mapper, taskMapper, runMapper,
                new GitWorkspaceOperations(),
                new GitWorkspaceMutationGate(),
                ledger, clock,
                temporaryDirectory.resolve("managed").toString(),
                maxRetained
        );
        return new Fixture(service, ledger);
    }

    private void selectWorktree(Fixture fixture, ConversationRun run) {
        fixture.service().handoff(
                run.getTaskId(), run.getWorkspacePath(), "NEW_WORKTREE", ""
        );
    }

    private Path createRepository()
            throws IOException, InterruptedException {
        Path repository = temporaryDirectory.resolve(
                "repository-" + System.nanoTime()
        );
        Files.createDirectories(repository);
        git(repository, "init");
        Files.writeString(repository.resolve("local.txt"), "base\n");
        Files.writeString(repository.resolve("isolated.txt"), "base\n");
        Files.writeString(repository.resolve("shared.txt"), "base\n");
        git(repository, "add", "-A");
        git(repository, "-c", "user.name=Lumora Test",
                "-c", "user.email=lumora@test.invalid",
                "commit", "-m", "base");
        return repository.toAbsolutePath().normalize();
    }

    private Path createUnbornRepository()
            throws IOException, InterruptedException {
        Path repository = temporaryDirectory.resolve(
                "unborn-repository-" + System.nanoTime()
        );
        Files.createDirectories(repository);
        git(repository, "init");
        Files.writeString(repository.resolve("local.txt"), "base\n");
        Files.writeString(repository.resolve("isolated.txt"), "base\n");
        Files.writeString(repository.resolve("shared.txt"), "base\n");
        return repository.toAbsolutePath().normalize();
    }

    private boolean hasHead(Path repository)
            throws IOException, InterruptedException {
        Process process = new ProcessBuilder(
                "git", "-C", repository.toString(),
                "rev-parse", "--verify", "HEAD"
        ).redirectErrorStream(true).start();
        process.getInputStream().readAllBytes();
        return process.waitFor() == 0;
    }

    private void git(Path repository, String... arguments)
            throws IOException, InterruptedException {
        gitOutput(repository, arguments);
    }

    private String gitOutput(Path repository, String... arguments)
            throws IOException, InterruptedException {
        java.util.ArrayList<String> command = new java.util.ArrayList<>();
        command.add("git");
        command.add("-C");
        command.add(repository.toString());
        command.addAll(java.util.List.of(arguments));
        Process process = new ProcessBuilder(command)
                .redirectErrorStream(true)
                .start();
        String output = new String(
                process.getInputStream().readAllBytes(),
                StandardCharsets.UTF_8
        );
        int exitCode = process.waitFor();
        if (exitCode != 0) {
            throw new IllegalStateException(output);
        }
        return output.trim();
    }

    private ConversationRun run(String taskId, Path workspace) {
        ConversationRun run = new ConversationRun();
        run.setRunId(taskId + "-run");
        run.setTaskId(taskId);
        run.setWorkspacePath(workspace.toString());
        return run;
    }

    private record Fixture(
            TaskWorktreeService service,
            WorkspaceChangeLedgerService ledger
    ) {
    }
}
