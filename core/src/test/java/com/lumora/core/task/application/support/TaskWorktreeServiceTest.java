package com.lumora.core.task.application.support;

import com.lumora.core.conversation.domain.entity.ConversationRun;
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
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
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
    }

    @Test
    void isolatesAndAppliesAConcurrentTaskBeforeTheFirstCommit()
            throws IOException, InterruptedException {
        Path repository = createUnbornRepository();
        Fixture fixture = fixture();
        ConversationRun localRun = run("task-local", repository);
        ConversationRun isolatedRun = run("task-isolated", repository);

        fixture.service().acquireForRun(localRun);
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
        fixture.service().onRunTerminal(localRun);

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
        fixture.service().acquireForRun(run("task-local", repository));
        ConversationRun isolatedRun = run("task-isolated", repository);
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
    }

    @Test
    void preservesBothSidesWhenTheThreeWayMergeConflicts()
            throws IOException, InterruptedException {
        Path repository = createRepository();
        Fixture fixture = fixture();
        ConversationRun localRun = run("task-local", repository);
        ConversationRun isolatedRun = run("task-isolated", repository);
        fixture.service().acquireForRun(localRun);
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

    private Fixture fixture() {
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
        Clock clock = Clock.fixed(
                Instant.parse("2026-08-22T00:00:00Z"), ZoneOffset.UTC
        );
        TaskWorktreeService service = new TaskWorktreeService(
                mapper, taskMapper, new GitWorkspaceOperations(), clock,
                temporaryDirectory.resolve("managed").toString(), 5
        );
        return new Fixture(service);
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

    private record Fixture(TaskWorktreeService service) {
    }
}
