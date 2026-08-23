package com.lumora.core.task.application.support;

import com.lumora.core.shared.infrastructure.git.GitWorkspaceMutationGate;
import com.lumora.core.task.application.service.TaskService;
import com.lumora.core.task.domain.entity.AgentTask;
import com.lumora.core.task.domain.model.TaskDetails;
import com.lumora.core.task.domain.model.TaskStatus;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionOperations;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TaskCreationCoordinatorTest {

    @Test
    void startsTheTransactionOnlyAfterTheWorkspaceGateIsAvailable()
            throws Exception {
        TaskService tasks = mock(TaskService.class);
        TaskWorktreeService worktrees = mock(TaskWorktreeService.class);
        GitWorkspaceMutationGate gate = new GitWorkspaceMutationGate();
        TransactionOperations transactions = mock(TransactionOperations.class);
        CountDownLatch transactionStarted = new CountDownLatch(1);
        doAnswer(invocation -> {
            transactionStarted.countDown();
            TransactionCallback<?> callback = invocation.getArgument(0);
            return callback.doInTransaction(mock(TransactionStatus.class));
        }).when(transactions).execute(any());
        when(tasks.createTask("goal", "F:/project", "correlation"))
                .thenReturn(taskDetails());
        TaskCreationCoordinator coordinator = new TaskCreationCoordinator(
                tasks, worktrees, gate, transactions
        );
        CountDownLatch gateHeld = new CountDownLatch(1);
        CountDownLatch releaseGate = new CountDownLatch(1);
        CountDownLatch createAttempted = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<?> mutation = executor.submit(() -> gate.execute(() -> {
                gateHeld.countDown();
                await(releaseGate);
            }));
            assertThat(gateHeld.await(2, TimeUnit.SECONDS)).isTrue();

            Future<TaskDetails> creation = executor.submit(() -> {
                createAttempted.countDown();
                return coordinator.createTask(
                        "goal", "F:/project", "correlation",
                        null, null, null
                );
            });
            assertThat(createAttempted.await(2, TimeUnit.SECONDS)).isTrue();
            assertThat(transactionStarted.await(
                    200, TimeUnit.MILLISECONDS
            )).isFalse();
            verify(tasks, never()).createTask(any(), any(), any());

            releaseGate.countDown();
            assertThat(creation.get(2, TimeUnit.SECONDS).getTask().getTaskId())
                    .isEqualTo("task-1");
            mutation.get(2, TimeUnit.SECONDS);
            assertThat(transactionStarted.getCount()).isZero();
        } finally {
            releaseGate.countDown();
            executor.shutdownNow();
        }
    }

    @Test
    void rollsBackTaskCreationWhenEnvironmentHandoffFails() {
        TaskService tasks = mock(TaskService.class);
        TaskWorktreeService worktrees = mock(TaskWorktreeService.class);
        PlatformTransactionManager transactionManager = mock(
                PlatformTransactionManager.class
        );
        TransactionStatus transaction = mock(TransactionStatus.class);
        when(transactionManager.getTransaction(any())).thenReturn(transaction);
        when(tasks.createTask("goal", "F:/project", "correlation"))
                .thenReturn(taskDetails());
        when(worktrees.handoff(
                "task-1", "F:/project", "NEW_WORKTREE", null
        )).thenThrow(new IllegalStateException("handoff failed"));
        TaskCreationCoordinator coordinator = new TaskCreationCoordinator(
                tasks, worktrees, new GitWorkspaceMutationGate(),
                new TransactionTemplate(transactionManager)
        );

        assertThatThrownBy(() -> coordinator.createTask(
                "goal", "F:/project", "correlation",
                "NEW_WORKTREE", null, false
        ))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("handoff failed");

        verify(transactionManager).rollback(transaction);
        verify(transactionManager, never()).commit(transaction);
    }

    private static TaskDetails taskDetails() {
        Instant now = Instant.parse("2026-08-23T00:00:00Z");
        AgentTask task = new AgentTask(
                "task-1", "goal", TaskStatus.PLANNING,
                0L, "", "", "", now, now
        );
        task.setWorkspacePath("F:/project");
        return new TaskDetails(task, List.of());
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(2, TimeUnit.SECONDS)) {
                throw new IllegalStateException("Timed out waiting for test gate");
            }
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while waiting", error);
        }
    }
}
