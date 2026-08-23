package com.lumora.core.task.application.support;

import com.lumora.core.shared.infrastructure.git.GitWorkspaceMutationGate;
import com.lumora.core.task.api.dto.response.TaskWorktreeResponse;
import com.lumora.core.task.application.service.TaskService;
import com.lumora.core.task.domain.model.TaskDetails;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionOperations;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.Objects;

/**
 * Creates a task and its initial execution-environment preference atomically.
 *
 * <p>The process-wide Workspace mutation gate is deliberately outside the
 * database transaction. This preserves the same gate-to-database lock order
 * used by Run binding, handoff and Git environment mutations.</p>
 */
@Service
public class TaskCreationCoordinator {

    private final TaskService taskService;
    private final TaskWorktreeService taskWorktreeService;
    private final GitWorkspaceMutationGate mutationGate;
    private final TransactionOperations transactions;

    @Autowired
    public TaskCreationCoordinator(
            TaskService taskService,
            TaskWorktreeService taskWorktreeService,
            GitWorkspaceMutationGate mutationGate,
            PlatformTransactionManager transactionManager
    ) {
        this(
                taskService, taskWorktreeService, mutationGate,
                new TransactionTemplate(transactionManager)
        );
    }

    TaskCreationCoordinator(
            TaskService taskService,
            TaskWorktreeService taskWorktreeService,
            GitWorkspaceMutationGate mutationGate,
            TransactionOperations transactions
    ) {
        this.taskService = taskService;
        this.taskWorktreeService = taskWorktreeService;
        this.mutationGate = mutationGate;
        this.transactions = transactions;
    }

    public TaskDetails createTask(
            String goal,
            String workspacePath,
            String correlationId,
            String environmentTarget,
            String worktreePath,
            Boolean autoApplyWhenClean
    ) {
        return mutationGate.execute(() -> Objects.requireNonNull(
                transactions.execute(status -> createInsideTransaction(
                        goal, workspacePath, correlationId,
                        environmentTarget, worktreePath,
                        autoApplyWhenClean
                )),
                "任务创建事务未返回结果"
        ));
    }

    private TaskDetails createInsideTransaction(
            String goal,
            String workspacePath,
            String correlationId,
            String environmentTarget,
            String worktreePath,
            Boolean autoApplyWhenClean
    ) {
        if (environmentTarget != null) {
            if ("EXISTING_WORKTREE".equalsIgnoreCase(environmentTarget)
                    && Boolean.TRUE.equals(autoApplyWhenClean)) {
                throw new IllegalArgumentException(
                        "现有 Worktree 由用户管理，不能开启自动应用"
                );
            }
            taskWorktreeService.preflight(
                    workspacePath, environmentTarget, worktreePath
            );
        }
        TaskDetails task = taskService.createTask(
                goal, workspacePath, correlationId
        );
        if (shouldCreateEnvironmentPreference(
                environmentTarget, workspacePath
        )) {
            TaskWorktreeResponse environment = taskWorktreeService.handoff(
                    task.getTask().getTaskId(), workspacePath,
                    environmentTarget, worktreePath
            );
            if (Boolean.TRUE.equals(autoApplyWhenClean)) {
                taskWorktreeService.updateSettings(
                        task.getTask().getTaskId(), true,
                        environment.settingsRevision()
                );
            }
        }
        return task;
    }

    private boolean shouldCreateEnvironmentPreference(
            String target,
            String workspacePath
    ) {
        if (target == null) return false;
        return !("LOCAL".equalsIgnoreCase(target)
                && (workspacePath == null || workspacePath.isBlank()));
    }
}
