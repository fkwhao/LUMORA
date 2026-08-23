package com.lumora.core.task.application.support;

import com.lumora.core.conversation.api.dto.response.ConversationFileChangeResponse;
import com.lumora.core.conversation.api.dto.response.ConversationRunChangesResponse;
import com.lumora.core.conversation.application.service.ConversationRunCoordinator;
import com.lumora.core.conversation.application.service.ConversationService;
import com.lumora.core.conversation.application.support.ConversationInputStore;
import com.lumora.core.conversation.application.support.ConversationRunEventJournal;
import com.lumora.core.conversation.application.support.ConversationRunEventStreamRegistry;
import com.lumora.core.conversation.application.support.ConversationRunStore;
import com.lumora.core.conversation.application.support.GitRunChangeService;
import com.lumora.core.conversation.application.support.WorkspaceChangeLedgerService;
import com.lumora.core.conversation.domain.entity.ConversationRun;
import com.lumora.core.conversation.domain.model.ConversationRunStatus;
import com.lumora.core.conversation.infrastructure.persistence.ConversationRunMapper;
import com.lumora.core.shared.infrastructure.git.GitWorkspaceOperations;
import com.lumora.core.shared.infrastructure.git.GitWorkspaceMutationGate;
import com.lumora.core.task.api.dto.request.GitChangesRequest;
import com.lumora.core.task.api.dto.request.GitCheckoutRequest;
import com.lumora.core.task.api.dto.response.GitReviewChangesResponse;
import com.lumora.core.task.api.dto.response.WorkspaceContextResponse;
import com.lumora.core.task.application.service.TaskService;
import com.lumora.core.task.domain.entity.AgentTask;
import com.lumora.core.task.domain.entity.TaskWorktree;
import com.lumora.core.task.domain.model.TaskWorkspaceMode;
import com.lumora.core.task.domain.model.WorktreeState;
import com.lumora.core.task.infrastructure.persistence.TaskMapper;
import com.lumora.core.task.infrastructure.persistence.TaskWorktreeMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class WorkspaceGitServiceTest {

    @TempDir
    Path temporaryDirectory;

    private TaskService taskService;
    private TaskMapper taskMapper;
    private TaskWorktreeMapper worktreeMapper;
    private TaskWorktreeService taskWorktreeService;
    private ConversationRunMapper runMapper;
    private GitRunChangeService runChanges;
    private WorkspaceChangeLedgerService ledger;
    private GitWorkspaceMutationGate mutationGate;
    private WorkspaceGitService service;
    private AgentTask task;

    @BeforeEach
    void setUp() {
        taskService = mock(TaskService.class);
        taskMapper = mock(TaskMapper.class);
        worktreeMapper = mock(TaskWorktreeMapper.class);
        taskWorktreeService = mock(TaskWorktreeService.class);
        runMapper = mock(ConversationRunMapper.class);
        runChanges = mock(GitRunChangeService.class);
        ledger = mock(WorkspaceChangeLedgerService.class);
        mutationGate = new GitWorkspaceMutationGate();
        task = new AgentTask();
        task.setTaskId("task-1");
        when(taskService.getTask("task-1")).thenReturn(task);
        when(worktreeMapper.selectById("task-1")).thenReturn(null);
        when(worktreeMapper.selectList(any())).thenReturn(List.of());
        when(taskMapper.selectList(any())).thenReturn(List.of(task));
        when(runMapper.selectList(any())).thenReturn(List.of());
        when(ledger.currentRevision(anyString())).thenReturn(0L);
        service = new WorkspaceGitService(
                taskService, taskMapper, worktreeMapper, taskWorktreeService,
                runMapper,
                new GitWorkspaceOperations(), mutationGate,
                runChanges, ledger,
                Clock.fixed(
                        Instant.parse("2026-08-23T00:00:00Z"),
                        ZoneOffset.UTC
                )
        );
    }

    @Test
    void inspectsAnUnbornRepositoryAndKeepsItsSymbolicBranch()
            throws Exception {
        Path repository = repository("unborn", false);
        task.setWorkspacePath(repository.toString());

        WorkspaceContextResponse result = service.contextForTask("task-1");

        assertThat(result.repositoryRoot()).isEqualTo(repository.toString());
        assertThat(result.headSha()).isEmpty();
        assertThat(result.detached()).isFalse();
        assertThat(result.branch().name()).isEqualTo("main");
        assertThat(result.branches()).extracting("name").contains("main");
    }

    @Test
    void returnsAUnifiedUncommittedScopeWithoutRendererGitCommands()
            throws Exception {
        Path repository = repository("changes", true);
        task.setWorkspacePath(repository.toString());
        Files.writeString(repository.resolve("tracked.txt"), "after\n");
        ConversationFileChangeResponse file = new ConversationFileChangeResponse(
                "tracked.txt", "", "MODIFIED", 1, 1,
                false, "patch", false
        );
        when(runChanges.diffTrees(
                anyString(), anyString(), anyString()
        )).thenReturn(List.of(file));

        GitReviewChangesResponse result = service.changes(
                "task-1",
                new GitChangesRequest(
                        "UNCOMMITTED", null, null,
                        null, null, null
                )
        );

        assertThat(result.scope()).isEqualTo("UNCOMMITTED");
        assertThat(result.additions()).isEqualTo(1);
        assertThat(result.deletions()).isEqualTo(1);
        assertThat(result.files()).containsExactly(file);
        verify(runChanges).diffTrees(
                anyString(), anyString(), anyString()
        );
    }

    @Test
    void blocksBranchCheckoutWhileAnyRunUsesTheSamePhysicalWorkspace()
            throws Exception {
        Path repository = repository("active", true);
        task.setWorkspacePath(repository.toString());
        command(repository, "branch", "feature/test");
        ConversationRun active = new ConversationRun();
        active.setTaskId("another-task");
        active.setWorkspacePath(repository.toString());
        active.setStatus(ConversationRunStatus.RUNNING);
        when(runMapper.selectList(any())).thenReturn(List.of(active));

        assertThatThrownBy(() -> service.checkout(
                "task-1", new GitCheckoutRequest(
                        "feature/test", null, 0L
                )
        ))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("活动 Run");
    }

    @Test
    void checksOutABranchAndAdvancesTheAuthoritativeRevision()
            throws Exception {
        Path repository = repository("checkout", true);
        task.setWorkspacePath(repository.toString());
        command(repository, "branch", "feature/test");
        when(ledger.advanceRevision(anyString())).thenReturn(1L);

        WorkspaceContextResponse result = service.checkout(
                "task-1", new GitCheckoutRequest(
                        "feature/test", null, 0L
                )
        );

        assertThat(result.branch().name()).isEqualTo("feature/test");
        verify(taskWorktreeService).onBranchCheckedOut(
                "task-1", "feature/test"
        );
        verify(ledger).advanceRevision(repository.toString());
    }

    @Test
    void runEnqueueCannotEnterDuringBranchCheckAndMutation()
            throws Exception {
        Path repository = repository("mutation-gate", true);
        task.setWorkspacePath(repository.toString());
        command(repository, "branch", "feature/test");
        GitWorkspaceOperations blockingGit = spy(
                new GitWorkspaceOperations()
        );
        CountDownLatch mutationReached = new CountDownLatch(1);
        CountDownLatch allowMutation = new CountDownLatch(1);
        CountDownLatch startAttempted = new CountDownLatch(1);
        CountDownLatch runEnqueued = new CountDownLatch(1);
        doAnswer(invocation -> {
            mutationReached.countDown();
            if (!allowMutation.await(5, TimeUnit.SECONDS)) {
                throw new AssertionError("checkout was never released");
            }
            invocation.callRealMethod();
            return null;
        }).when(blockingGit).checkoutBranch(
                any(Path.class), eq("feature/test")
        );
        WorkspaceGitService gatedService = new WorkspaceGitService(
                taskService, taskMapper, worktreeMapper, taskWorktreeService,
                runMapper, blockingGit, mutationGate, runChanges, ledger,
                Clock.fixed(
                        Instant.parse("2026-08-23T00:00:00Z"),
                        ZoneOffset.UTC
                )
        );
        ConversationRunStore coordinatorRuns = mock(
                ConversationRunStore.class
        );
        AtomicReference<ConversationRun> insertedRun = new AtomicReference<>();
        when(coordinatorRuns.findActiveForTask("task-queued"))
                .thenReturn(null);
        doAnswer(invocation -> {
            insertedRun.set(invocation.getArgument(0));
            runEnqueued.countDown();
            return null;
        }).when(coordinatorRuns).insert(any(ConversationRun.class));
        when(coordinatorRuns.require(anyString()))
                .thenAnswer(invocation -> insertedRun.get());
        when(coordinatorRuns.updateWorkspacePath(anyString(), anyString()))
                .thenAnswer(invocation -> insertedRun.get());
        when(coordinatorRuns.updateStatus(
                anyString(), any(ConversationRunStatus.class), anyString()
        )).thenAnswer(invocation -> {
            ConversationRun run = insertedRun.get();
            run.setStatus(invocation.getArgument(1));
            return run;
        });
        when(taskWorktreeService.acquireForRun(any(ConversationRun.class)))
                .thenAnswer(invocation -> invocation
                        .<ConversationRun>getArgument(0).getWorkspacePath());
        ConversationRunCoordinator coordinator = new ConversationRunCoordinator(
                mock(ConversationService.class), coordinatorRuns,
                mock(ConversationInputStore.class),
                mock(ConversationRunEventStreamRegistry.class),
                mock(ConversationRunEventJournal.class), taskService,
                runChanges, taskWorktreeService, mutationGate,
                Clock.fixed(
                        Instant.parse("2026-08-23T00:00:00Z"),
                        ZoneOffset.UTC
                ),
                1
        );
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<?> checkout = executor.submit(() -> gatedService.checkout(
                    "task-1", new GitCheckoutRequest(
                            "feature/test", null, 0L
                    )
            ));
            assertThat(mutationReached.await(5, TimeUnit.SECONDS)).isTrue();

            Future<?> enqueue = executor.submit(() -> {
                startAttempted.countDown();
                return coordinator.startMessage(
                        "task-queued", "inspect branch", null, null,
                        repository.toString(), null, "correlation-1"
                );
            });
            assertThat(startAttempted.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(runEnqueued.await(200, TimeUnit.MILLISECONDS)).isFalse();

            allowMutation.countDown();
            checkout.get(5, TimeUnit.SECONDS);
            enqueue.get(5, TimeUnit.SECONDS);
            assertThat(runEnqueued.getCount()).isZero();
        } finally {
            allowMutation.countDown();
            executor.shutdownNow();
        }
    }

    @Test
    void linkedWorktreeMutationUsesItsOwnPhysicalRevisionKey()
            throws Exception {
        Path repository = repository("revision-primary", true);
        task.setWorkspacePath(repository.toString());
        command(repository, "branch", "isolated");
        command(repository, "branch", "feature/next");
        Path linked = temporaryDirectory.resolve("revision-linked")
                .toAbsolutePath().normalize();
        command(repository, "worktree", "add", linked.toString(), "isolated");
        TaskWorktree lease = new TaskWorktree();
        lease.setTaskId("task-1");
        lease.setWorkspaceMode(TaskWorkspaceMode.WORKTREE);
        lease.setSourceWorkspacePath(repository.toString());
        lease.setEffectiveWorkspacePath(linked.toString());
        lease.setRepositoryRoot(repository.toString());
        lease.setWorktreeState(WorktreeState.BRANCHED);
        when(worktreeMapper.selectById("task-1")).thenReturn(lease);
        when(ledger.currentRevision(linked.toString())).thenReturn(9L);

        service.checkout(
                "task-1", new GitCheckoutRequest(
                        "feature/next", null, 9L
                )
        );

        verify(ledger).advanceRevision(linked.toString());
        verify(ledger, never()).advanceRevision(repository.toString());
        verify(taskWorktreeService).onBranchCheckedOut(
                "task-1", "feature/next"
        );
    }

    @Test
    void existingLinkedWorktreeIsProjectedAsUserManagedWithoutAutoApply()
            throws Exception {
        Path repository = repository("existing-primary", true);
        task.setWorkspacePath(repository.toString());
        command(repository, "branch", "user/experiment");
        Path linked = temporaryDirectory.resolve("existing-linked")
                .toAbsolutePath().normalize();
        command(
                repository, "worktree", "add", linked.toString(),
                "user/experiment"
        );
        TaskWorktree lease = new TaskWorktree();
        lease.setTaskId("task-1");
        lease.setWorkspaceMode(TaskWorkspaceMode.WORKTREE);
        lease.setSourceWorkspacePath(repository.toString());
        lease.setEffectiveWorkspacePath(linked.toString());
        lease.setRepositoryRoot(repository.toString());
        lease.setWorktreeState(WorktreeState.BRANCHED);
        lease.setManagedByLumora(false);
        lease.setAutoApplyWhenClean(false);
        when(worktreeMapper.selectById("task-1")).thenReturn(lease);
        when(worktreeMapper.selectList(any())).thenReturn(List.of(lease));

        WorkspaceContextResponse context = service.contextForTask("task-1");

        assertThat(context.environment().managedByLumora()).isFalse();
        assertThat(context.environment().canAutoApply()).isFalse();
        assertThat(context.environment().autoApplyWhenClean()).isFalse();
        assertThat(context.worktrees())
                .filteredOn(item -> linked.toString().equals(item.path()))
                .singleElement()
                .satisfies(item -> {
                    assertThat(item.managedByLumora()).isFalse();
                    assertThat(item.canAutoApply()).isFalse();
                    assertThat(item.removable()).isFalse();
                });
    }

    @Test
    void historyCursorIsExclusiveAcrossPages() throws Exception {
        Path repository = repository("history", true);
        task.setWorkspacePath(repository.toString());
        for (int index = 1; index <= 4; index += 1) {
            Files.writeString(
                    repository.resolve("tracked.txt"), "version " + index + "\n"
            );
            command(repository, "add", "tracked.txt");
            command(repository, "commit", "-m", "change " + index);
        }

        var first = service.history("task-1", 2, null);
        var second = service.history("task-1", 2, first.nextCursor());

        assertThat(first.commits()).hasSize(2);
        assertThat(second.commits()).hasSize(2);
        assertThat(first.commits()).extracting("sha")
                .doesNotContainAnyElementsOf(
                        second.commits().stream().map(item -> item.sha()).toList()
                );
        assertThat(first.commits()).extracting("summary")
                .containsExactly("change 4", "change 3");
        assertThat(second.commits()).extracting("summary")
                .containsExactly("change 2", "change 1");
    }

    @Test
    void supportsAllSixReviewScopesWithOneResponseContract()
            throws Exception {
        Path repository = repository("scopes", true);
        task.setWorkspacePath(repository.toString());
        Files.writeString(repository.resolve("tracked.txt"), "second\n");
        command(repository, "add", "tracked.txt");
        command(repository, "commit", "-m", "second");
        String head = new GitWorkspaceOperations().head(repository);
        when(runChanges.diffTrees(
                anyString(), anyString(), anyString()
        )).thenReturn(List.of());
        when(runChanges.changes("task-1", "run-1")).thenReturn(
                new ConversationRunChangesResponse(
                        "run-1", "CAPTURED", repository.toString(), "",
                        0, 0, true, List.of(),
                        Instant.parse("2026-08-23T00:00:00Z"), null
                )
        );

        List<GitChangesRequest> requests = List.of(
                new GitChangesRequest(
                        "LAST_RUN", "run-1", null,
                        null, null, null
                ),
                new GitChangesRequest(
                        "UNCOMMITTED", null, null,
                        null, null, null
                ),
                new GitChangesRequest(
                        "UNSTAGED", null, null,
                        null, null, null
                ),
                new GitChangesRequest(
                        "STAGED", null, null,
                        null, null, null
                ),
                new GitChangesRequest(
                        "COMMIT", null, head,
                        null, null, null
                ),
                new GitChangesRequest(
                        "BRANCH_COMPARE", null, null,
                        null, "HEAD~1", "HEAD"
                )
        );

        assertThat(requests.stream()
                .map(request -> service.changes("task-1", request).scope())
                .toList())
                .containsExactly(
                        "LAST_RUN", "UNCOMMITTED", "UNSTAGED", "STAGED",
                        "COMMIT", "BRANCH_COMPARE"
                );
    }

    @Test
    void ignoredOnlyWorktreeIsNeitherRemovableNorDeleted()
            throws Exception {
        Path repository = repository("ignored-worktree", true);
        task.setWorkspacePath(repository.toString());
        Files.writeString(repository.resolve(".gitignore"), "private.log\n");
        command(repository, "add", ".gitignore");
        command(repository, "commit", "-m", "ignore local output");
        command(repository, "branch", "isolated");
        Path linked = temporaryDirectory.resolve("ignored-linked")
                .toAbsolutePath().normalize();
        command(repository, "worktree", "add", linked.toString(), "isolated");
        Files.writeString(linked.resolve("private.log"), "do not delete\n");

        var environments = service.worktrees("task-1");

        assertThat(environments)
                .filteredOn(item -> linked.toString().equals(
                        item.worktreePath()
                ))
                .singleElement()
                .satisfies(item -> assertThat(item.removable()).isFalse());
        assertThatThrownBy(() -> service.removeWorktree(
                "task-1", linked.toString()
        ))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("被忽略文件");
        assertThat(Files.exists(linked.resolve("private.log"))).isTrue();
    }

    private Path repository(String name, boolean commit) throws Exception {
        Path result = temporaryDirectory.resolve(name);
        Files.createDirectories(result);
        command(result, "init", "-b", "main");
        command(result, "config", "user.name", "Lumora Test");
        command(result, "config", "user.email", "lumora@example.invalid");
        if (commit) {
            Files.writeString(result.resolve("tracked.txt"), "before\n");
            command(result, "add", "tracked.txt");
            command(result, "commit", "-m", "initial");
        }
        return result.toAbsolutePath().normalize();
    }

    private void command(Path root, String... arguments) throws Exception {
        String[] complete = new String[arguments.length + 5];
        complete[0] = "git";
        complete[1] = "-c";
        complete[2] = "core.autocrlf=false";
        complete[3] = "-C";
        complete[4] = root.toString();
        System.arraycopy(arguments, 0, complete, 5, arguments.length);
        Process process = new ProcessBuilder(complete)
                .redirectErrorStream(true)
                .start();
        if (!process.waitFor(20, TimeUnit.SECONDS)) {
            process.destroyForcibly();
            throw new AssertionError("Git test command timed out");
        }
        String output = new String(
                process.getInputStream().readAllBytes(), StandardCharsets.UTF_8
        );
        if (process.exitValue() != 0) {
            throw new AssertionError("Git test command failed: " + output);
        }
    }
}
