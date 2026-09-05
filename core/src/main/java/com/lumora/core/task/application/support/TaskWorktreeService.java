package com.lumora.core.task.application.support;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.lumora.core.conversation.application.support.WorkspaceChangeLedgerService;
import com.lumora.core.conversation.domain.entity.ConversationRun;
import com.lumora.core.conversation.infrastructure.persistence.ConversationRunMapper;
import com.lumora.core.shared.infrastructure.git.GitWorkspaceMutationGate;
import com.lumora.core.shared.infrastructure.git.GitWorkspaceOperations;
import com.lumora.core.shared.infrastructure.git.GitWorkspaceOperations.MergeResult;
import com.lumora.core.shared.infrastructure.git.GitWorkspaceOperations.Snapshot;
import com.lumora.core.task.api.dto.response.TaskWorktreeResponse;
import com.lumora.core.task.domain.entity.TaskWorktree;
import com.lumora.core.task.domain.model.TaskWorkspaceMode;
import com.lumora.core.task.domain.model.WorktreeState;
import com.lumora.core.task.infrastructure.persistence.TaskWorktreeMapper;
import com.lumora.core.task.infrastructure.persistence.TaskMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Owns the task-level Local/Worktree lease and all result lifecycle changes.
 * Child agents deliberately receive only the effective path selected here.
 */
@Service
public class TaskWorktreeService {

    private static final Logger LOGGER = LoggerFactory.getLogger(
            TaskWorktreeService.class
    );
    private static final Set<WorktreeState> REVIEWABLE = EnumSet.of(
            WorktreeState.WAITING_REVIEW, WorktreeState.CONFLICTED
    );
    private static final Set<WorktreeState> CHANGESET_VISIBLE = EnumSet.of(
            WorktreeState.WAITING_REVIEW, WorktreeState.CONFLICTED,
            WorktreeState.CLEANUP_PENDING, WorktreeState.BRANCHED
    );
    private static final Set<WorktreeState> TEMPORARY_RETAINED = EnumSet.of(
            WorktreeState.PROVISIONING, WorktreeState.ACTIVE,
            WorktreeState.WAITING_REVIEW, WorktreeState.APPLYING,
            WorktreeState.CONFLICTED, WorktreeState.CLEANUP_PENDING
    );

    private final TaskWorktreeMapper worktreeMapper;
    private final TaskMapper taskMapper;
    private final ConversationRunMapper runMapper;
    private final GitWorkspaceOperations git;
    private final GitWorkspaceMutationGate mutationGate;
    private final WorkspaceChangeLedgerService workspaceLedger;
    private final Clock clock;
    private final Path managedRoot;
    private final int maxRetained;

    @Autowired
    public TaskWorktreeService(
            TaskWorktreeMapper worktreeMapper,
            TaskMapper taskMapper,
            ConversationRunMapper runMapper,
            GitWorkspaceOperations git,
            GitWorkspaceMutationGate mutationGate,
            WorkspaceChangeLedgerService workspaceLedger,
            Clock clock,
            @Value("${lumora.worktrees.root:}") String configuredRoot,
            @Value("${lumora.worktrees.max-retained:5}") int maxRetained
    ) {
        this.worktreeMapper = worktreeMapper;
        this.taskMapper = taskMapper;
        this.runMapper = runMapper;
        this.git = git;
        this.mutationGate = mutationGate;
        this.workspaceLedger = workspaceLedger;
        this.clock = clock;
        this.managedRoot = configuredRoot == null || configuredRoot.isBlank()
                ? Path.of(System.getProperty("java.io.tmpdir"),
                "lumora-worktrees").toAbsolutePath().normalize()
                : Path.of(configuredRoot).toAbsolutePath().normalize();
        if (maxRetained < 1) {
            throw new IllegalArgumentException(
                    "lumora.worktrees.max-retained 必须大于 0"
            );
        }
        this.maxRetained = maxRetained;
    }

    /** Test-compatible constructor for fixtures without a durable ledger. */
    public TaskWorktreeService(
            TaskWorktreeMapper worktreeMapper,
            TaskMapper taskMapper,
            ConversationRunMapper runMapper,
            GitWorkspaceOperations git,
            Clock clock,
            String configuredRoot,
            int maxRetained
    ) {
        this(
                worktreeMapper, taskMapper, runMapper, git,
                new GitWorkspaceMutationGate(), null, clock,
                configuredRoot, maxRetained
        );
    }

    public String acquireForRun(ConversationRun run) {
        return mutationGate.execute(() -> acquireForRunLocked(run));
    }

    private synchronized String acquireForRunLocked(ConversationRun run) {
        Path requested = requiredWorkspace(run.getWorkspacePath());
        TaskWorktree existing = worktreeMapper.selectById(run.getTaskId());
        if (canReuse(existing)) {
            Path effective = normalized(existing.getEffectiveWorkspacePath());
            if (!Files.isDirectory(effective)) {
                fail(existing, "任务关联的 Worktree 已不存在");
                throw new IllegalStateException("任务关联的 Worktree 已不存在");
            }
            if (existing.getWorktreeState() != WorktreeState.BRANCHED) {
                updateState(existing, WorktreeState.ACTIVE, "");
            }
            return effective.toString();
        }
        boolean explicitlyIsolated = existing != null
                && existing.getWorkspaceMode() == TaskWorkspaceMode.WORKTREE;
        if (!explicitlyIsolated) {
            if (git.isRepository(requested)) {
                Path localRepository = git.repositoryRoot(requested);
                saveLocal(
                        run.getTaskId(), requested,
                        localRepository.toString(), git.head(localRepository)
                );
            } else {
                saveLocal(run.getTaskId(), requested, "", "");
            }
            return requested.toString();
        }
        if (!git.isRepository(requested)) {
            throw new IllegalStateException(
                    "显式 Worktree 环境要求任务工作区属于 Git 仓库"
            );
        }

        Path repositoryRoot = git.repositoryRoot(requested);
        ensureCapacity();
        boolean localBusy = hasOtherActiveLocal(
                run.getTaskId(), repositoryRoot.toString()
        );
        String committedHead = git.head(repositoryRoot);
        if (localBusy && committedHead.isBlank()) {
            throw new IllegalStateException(
                    "共享 Local 正在写入且仓库尚无首个提交；请等待 Local Run 进入安全状态"
            );
        }
        Snapshot base = localBusy
                ? new Snapshot(
                git.commitTree(repositoryRoot, committedHead),
                committedHead,
                git.commitTree(repositoryRoot, committedHead)
        ) : git.snapshot(repositoryRoot);
        String baseCommit = base.head();
        boolean syntheticBase = baseCommit.isBlank();
        if (syntheticBase) {
            baseCommit = git.createInternalCommit(
                    repositoryRoot, base.tree(),
                    "Lumora unborn Worktree baseline"
            );
        }
        Path destinationRoot = destination(repositoryRoot, run.getTaskId());
        Path relativeWorkspace = repositoryRoot.relativize(requested);
        Path effectiveWorkspace = destinationRoot.resolve(relativeWorkspace)
                .toAbsolutePath().normalize();
        if (Files.exists(destinationRoot)) {
            throw new IllegalStateException(
                    "临时 Worktree 目录已存在，需先完成恢复或清理: "
                            + destinationRoot
            );
        }
        TaskWorktree lease = newLease(
                run.getTaskId(), TaskWorkspaceMode.WORKTREE,
                requested, effectiveWorkspace, repositoryRoot,
                baseCommit, base.tree(), WorktreeState.PROVISIONING
        );
        lease.setManagedByLumora(true);
        lease.setAutoApplyWhenClean(existing.isAutoApplyWhenClean());
        lease.setSettingsRevision(existing.getSettingsRevision());
        save(lease);
        try {
            if (syntheticBase) {
                git.keepTree(
                        repositoryRoot,
                        baseReference(run.getTaskId()), baseCommit
                );
            }
            Files.createDirectories(destinationRoot.getParent());
            git.createDetachedWorktree(
                    repositoryRoot, destinationRoot, baseCommit, base.tree()
            );
            Files.createDirectories(effectiveWorkspace);
            keepResultTree(lease, base.tree());
            updateState(lease, WorktreeState.ACTIVE, "");
            return effectiveWorkspace.toString();
        } catch (IOException | RuntimeException error) {
            if (Files.exists(destinationRoot)) {
                updateState(
                        lease, WorktreeState.CLEANUP_PENDING,
                        "Worktree 创建失败，残留目录将在后台清理: "
                                + safeMessage(error)
                );
            } else {
                if (syntheticBase) {
                    try {
                        deleteBaseReference(lease);
                    } catch (RuntimeException cleanupError) {
                        error.addSuppressed(cleanupError);
                    }
                }
                fail(lease, safeMessage(error));
            }
            throw new IllegalStateException(
                    "无法创建任务 Worktree: " + safeMessage(error), error
            );
        }
    }

    public void onRunTerminal(ConversationRun run) {
        mutationGate.execute(() -> onRunTerminalLocked(run));
    }

    private synchronized void onRunTerminalLocked(ConversationRun run) {
        TaskWorktree lease = worktreeMapper.selectById(run.getTaskId());
        if (lease == null) return;
        if (lease.getWorkspaceMode() == TaskWorkspaceMode.LOCAL) {
            lease.setCompletedAt(clock.instant());
            updateState(lease, WorktreeState.RELEASED, "");
            autoApplyReady(lease.getRepositoryRoot());
            return;
        }
        if (lease.getWorktreeState() == WorktreeState.REMOVED
                || lease.getWorktreeState() == WorktreeState.FAILED
                || lease.getWorktreeState()
                == WorktreeState.CLEANUP_PENDING) {
            return;
        }
        boolean branched = lease.getWorktreeState()
                == WorktreeState.BRANCHED;
        Path physicalRoot = worktreeRoot(lease);
        if (!Files.isDirectory(physicalRoot)) {
            fail(lease, "任务 Worktree 在执行结束前已丢失");
            return;
        }
        try {
            Snapshot result = git.snapshot(physicalRoot);
            List<String> ignoredEffects = git.ignoredUntracked(
                    physicalRoot, 100
            );
            lease.setResultTree(result.tree());
            lease.setCompletedAt(clock.instant());
            keepResultTree(lease, result.tree());
            if (branched) {
                updateState(
                        lease, WorktreeState.BRANCHED,
                        lease.isManagedByLumora()
                                ? "分支 " + lease.getBranchName()
                                + " 已更新，修改保持为未提交状态"
                                : "现有 Worktree 已更新并继续由用户管理；"
                                + "可切回 Local，Lumora 不会删除该目录"
                );
                return;
            }
            if (!ignoredEffects.isEmpty()) {
                updateState(
                        lease, WorktreeState.WAITING_REVIEW,
                        "Worktree 包含 " + ignoredEffects.size()
                                + " 个被 Git 忽略的新增文件；"
                                + "为避免数据丢失，已保留并禁用自动应用"
                );
                return;
            }
            if (result.tree().equals(lease.getBaseTree())) {
                cleanup(lease, "任务没有文件改动，临时 Worktree 已清理");
            } else {
                updateState(
                        lease, WorktreeState.WAITING_REVIEW,
                        "修改已隔离保存，等待应用到 Local、创建分支或放弃"
                );
                if (lease.isAutoApplyWhenClean()
                        && !hasOtherActiveLocal(
                        lease.getTaskId(), lease.getRepositoryRoot())) {
                    attemptAutoApply(lease);
                }
            }
        } catch (RuntimeException error) {
            fail(lease, safeMessage(error));
        }
    }

    public void onRunReverted(ConversationRun run) {
        mutationGate.execute(() -> onRunRevertedLocked(run));
    }

    private synchronized void onRunRevertedLocked(ConversationRun run) {
        TaskWorktree lease = worktreeMapper.selectById(run.getTaskId());
        if (lease == null
                || lease.getWorkspaceMode() != TaskWorkspaceMode.WORKTREE
                || lease.getWorktreeState() == WorktreeState.REMOVED
                || lease.getWorktreeState() == WorktreeState.FAILED
                || lease.getWorktreeState()
                == WorktreeState.CLEANUP_PENDING) {
            return;
        }
        Path physicalRoot = worktreeRoot(lease);
        if (!Files.isDirectory(physicalRoot)) return;
        Snapshot current = git.snapshot(physicalRoot);
        List<String> ignoredEffects = git.ignoredUntracked(physicalRoot, 100);
        lease.setResultTree(current.tree());
        keepResultTree(lease, current.tree());
        if (lease.getWorktreeState() == WorktreeState.BRANCHED) {
            updateState(
                    lease, WorktreeState.BRANCHED,
                    "分支 " + lease.getBranchName()
                            + " 的最新一轮已撤回"
            );
            return;
        }
        if (current.tree().equals(lease.getBaseTree())
                && ignoredEffects.isEmpty()) {
            cleanup(lease, "撤回后不再包含任务修改，临时 Worktree 已清理");
        } else {
            updateState(
                    lease, WorktreeState.WAITING_REVIEW,
                    "最新一轮已撤回，剩余隔离修改等待处理"
            );
        }
    }

    public synchronized TaskWorktreeResponse status(String taskId) {
        TaskWorktree lease = worktreeMapper.selectById(taskId);
        return lease == null ? null : TaskWorktreeResponse.from(lease);
    }

    public TaskWorktreeResponse handoff(
            String taskId,
            String sourceWorkspacePath,
            String target,
            String existingWorktreePath
    ) {
        return mutationGate.execute(() -> handoffLocked(
                taskId, sourceWorkspacePath, target, existingWorktreePath
        ));
    }

    private synchronized TaskWorktreeResponse handoffLocked(
            String taskId,
            String sourceWorkspacePath,
            String target,
            String existingWorktreePath
    ) {
        String normalizedTarget = valueOrEmpty(target).toUpperCase();
        preflight(sourceWorkspacePath, normalizedTarget, existingWorktreePath);
        Path source = requiredWorkspace(sourceWorkspacePath);
        ensureNoActiveRun(taskId);
        TaskWorktree current = worktreeMapper.selectById(taskId);
        if (current != null
                && current.getWorktreeState().retainsWorkspace()
                && current.getWorktreeState() != WorktreeState.BRANCHED) {
            throw new IllegalStateException(
                    "当前任务仍保留 Worktree；请先应用、创建分支或放弃修改"
            );
        }
        return switch (normalizedTarget) {
            case "LOCAL" -> selectLocal(taskId, source);
            case "WORKTREE", "NEW_WORKTREE" -> selectNewWorktree(
                    taskId, source, current
            );
            case "EXISTING_WORKTREE" -> adoptExisting(
                    taskId, source, existingWorktreePath, current
            );
            default -> throw new IllegalArgumentException(
                    "target 必须是 LOCAL、NEW_WORKTREE 或 EXISTING_WORKTREE"
            );
        };
    }

    /** Read-only validation used before a task row is created. */
    public synchronized void preflight(
            String sourceWorkspacePath,
            String target,
            String existingWorktreePath
    ) {
        String normalizedTarget = valueOrEmpty(target).toUpperCase();
        if ("LOCAL".equals(normalizedTarget)) {
            if (!valueOrEmpty(sourceWorkspacePath).isBlank()) {
                requiredWorkspace(sourceWorkspacePath);
            }
            return;
        }
        if (!Set.of("WORKTREE", "NEW_WORKTREE", "EXISTING_WORKTREE")
                .contains(normalizedTarget)) {
            throw new IllegalArgumentException(
                    "target 必须是 LOCAL、NEW_WORKTREE 或 EXISTING_WORKTREE"
            );
        }
        Path source = requiredWorkspace(sourceWorkspacePath);
        if (!git.isRepository(source)) {
            throw new IllegalStateException(
                    "显式 Worktree 环境要求任务工作区属于 Git 仓库"
            );
        }
        if (!"EXISTING_WORKTREE".equals(normalizedTarget)) return;
        if (valueOrEmpty(existingWorktreePath).isBlank()) {
            throw new IllegalArgumentException("必须指定现有 Worktree 路径");
        }
        Path selected = normalized(existingWorktreePath);
        requireDirectory(selected, "指定的 Worktree 不存在");
        if (!git.isRepository(selected)) {
            throw new IllegalArgumentException("指定目录不是 Git Worktree");
        }
        Path sourcePrimary = git.primaryWorktree(source);
        Path selectedPrimary = git.primaryWorktree(selected);
        Path selectedRoot = git.repositoryRoot(selected);
        if (!sourcePrimary.equals(selectedPrimary)) {
            throw new IllegalArgumentException("指定 Worktree 不属于任务仓库");
        }
        if (selectedRoot.equals(sourcePrimary)) {
            throw new IllegalArgumentException("主工作树不能作为现有 Worktree 选择");
        }
        if (!Files.isRegularFile(selectedRoot.resolve(".git"))) {
            throw new IllegalArgumentException("指定目录不是 linked Worktree");
        }
    }

    public synchronized TaskWorktreeResponse updateSettings(
            String taskId,
            boolean autoApplyWhenClean,
            long expectedRevision
    ) {
        TaskWorktree lease = require(taskId);
        if (lease.getWorkspaceMode() != TaskWorkspaceMode.WORKTREE) {
            throw new IllegalStateException("autoApplyWhenClean 仅适用于显式 Worktree");
        }
        if (!lease.isManagedByLumora()) {
            throw new IllegalStateException(
                    "外部采用的 Worktree 由用户管理，不能开启自动应用"
            );
        }
        if (Set.of(
                WorktreeState.BRANCHED,
                WorktreeState.CLEANUP_PENDING,
                WorktreeState.REMOVED,
                WorktreeState.FAILED
        ).contains(lease.getWorktreeState())) {
            throw new IllegalStateException(
                    "当前 Worktree 状态不支持修改自动应用设置"
            );
        }
        if (lease.getSettingsRevision() != expectedRevision) {
            throw new IllegalStateException(
                    "Worktree 设置已更新，请刷新后重试"
            );
        }
        lease.setAutoApplyWhenClean(autoApplyWhenClean);
        lease.setSettingsRevision(expectedRevision + 1L);
        updateState(
                lease,
                lease.getWorktreeState(),
                autoApplyWhenClean
                        ? "已开启无冲突时自动应用"
                        : "已关闭自动应用"
        );
        return TaskWorktreeResponse.from(lease);
    }

    public synchronized ChangeRange changeRange(String taskId) {
        TaskWorktree lease = worktreeMapper.selectById(taskId);
        if (lease == null
                || lease.getWorkspaceMode() != TaskWorkspaceMode.WORKTREE
                || !CHANGESET_VISIBLE.contains(lease.getWorktreeState())
                || valueOrEmpty(lease.getBaseTree()).isBlank()
                || valueOrEmpty(lease.getResultTree()).isBlank()) {
            return null;
        }
        return new ChangeRange(
                lease.getTaskId(), lease.getWorktreeState().name(),
                lease.getRepositoryRoot(), lease.getReason(),
                lease.getBaseTree(), lease.getResultTree()
        );
    }

    public synchronized String sourceWorkspacePath(String taskId) {
        TaskWorktree lease = worktreeMapper.selectById(taskId);
        return lease == null ? "" : valueOrEmpty(
                lease.getSourceWorkspacePath()
        );
    }

    public TaskWorktreeResponse apply(String taskId) {
        return mutationGate.execute(() -> applyLocked(taskId));
    }

    private synchronized TaskWorktreeResponse applyLocked(String taskId) {
        TaskWorktree lease = requireReviewable(taskId);
        requireManagedTemporary(lease, "应用");
        rejectIgnoredEffects(lease);
        if (refreshChangedReview(lease)) return TaskWorktreeResponse.from(lease);
        if (hasOtherActiveLocal(taskId, lease.getRepositoryRoot())) {
            throw new IllegalStateException(
                    "Local 工作区仍有任务正在写入，请等待其进入安全状态"
            );
        }
        Path source = normalized(lease.getRepositoryRoot());
        requireDirectory(source, "Local 工作区不存在");
        Snapshot local = git.snapshot(source);
        MergeResult merge = git.mergeTrees(
                normalized(lease.getRepositoryRoot()),
                lease.getBaseTree(), local.tree(), lease.getResultTree()
        );
        if (merge.conflicted()) {
            updateState(
                    lease, WorktreeState.CONFLICTED,
                    merge.details().isBlank()
                            ? "Local 与 Worktree 修改发生冲突"
                            : merge.details()
            );
            return TaskWorktreeResponse.from(lease);
        }
        List<String> physicalConflicts = git.untrackedOverwriteConflicts(
                source, local.tree(), merge.tree(), 100
        );
        if (!physicalConflicts.isEmpty()) {
            updateState(
                    lease,
                    WorktreeState.CONFLICTED,
                    "Local 存在未纳入 Git tree 的忽略文件，应用会覆盖其物理内容: "
                            + String.join(", ", physicalConflicts)
            );
            return TaskWorktreeResponse.from(lease);
        }
        updateState(lease, WorktreeState.APPLYING, "正在应用到 Local");
        try {
            git.materializeTree(source, local.tree(), merge.tree());
            Snapshot applied = git.snapshot(source);
            if (!applied.tree().equals(merge.tree())
                    || !applied.head().equals(local.head())
                    || !applied.indexTree().equals(local.indexTree())) {
                throw new IllegalStateException(
                        "应用后 Git HEAD、暂存区或工作区校验失败"
                );
            }
        } catch (RuntimeException error) {
            rollbackLocal(source, local, error);
            updateState(
                    lease, WorktreeState.WAITING_REVIEW,
                    "应用失败，Local 已恢复: " + safeMessage(error)
            );
            throw error;
        }
        advanceRevision(source);
        cleanup(lease, "修改已应用到 Local，临时 Worktree 已清理");
        return TaskWorktreeResponse.from(lease);
    }

    public TaskWorktreeResponse createBranch(
            String taskId,
            String requestedBranchName
    ) {
        return mutationGate.execute(() -> createBranchLocked(
                taskId, requestedBranchName
        ));
    }

    private synchronized TaskWorktreeResponse createBranchLocked(
            String taskId,
            String requestedBranchName
    ) {
        TaskWorktree lease = requireReviewable(taskId);
        rejectIgnoredEffects(lease);
        if (refreshChangedReview(lease)) return TaskWorktreeResponse.from(lease);
        String branchName = requireBranchName(requestedBranchName);
        Path effective = worktreeRoot(lease);
        requireDirectory(effective, "任务 Worktree 不存在");
        if (usesSyntheticBase(lease)) {
            git.createOrphanBranch(
                    effective, branchName, lease.getBaseCommit(),
                    lease.getResultTree()
            );
        } else {
            git.createBranch(effective, branchName, lease.getBaseCommit());
        }
        lease.setBranchName(branchName);
        updateState(
                lease, WorktreeState.BRANCHED,
                "已创建分支 " + branchName + "；修改保持为未提交状态"
        );
        advanceRevision(effective);
        return TaskWorktreeResponse.from(lease);
    }

    /** Keeps task state aligned after the generic Git header switches branch. */
    public synchronized void onBranchCheckedOut(
            String taskId,
            String branchName
    ) {
        TaskWorktree lease = worktreeMapper.selectById(taskId);
        if (lease == null
                || lease.getWorkspaceMode() != TaskWorkspaceMode.WORKTREE
                || !lease.getWorktreeState().retainsWorkspace()) {
            return;
        }
        String normalizedBranch = requireBranchName(branchName);
        lease.setBranchName(normalizedBranch);
        updateState(
                lease, WorktreeState.BRANCHED,
                "已切换到正式分支 " + normalizedBranch
                        + "；该 Worktree 不会被自动清理"
        );
    }

    public TaskWorktreeResponse discard(String taskId) {
        return mutationGate.execute(() -> discardLocked(taskId));
    }

    private synchronized TaskWorktreeResponse discardLocked(String taskId) {
        TaskWorktree lease = require(taskId);
        requireManagedTemporary(lease, "放弃");
        if (lease.getWorkspaceMode() != TaskWorkspaceMode.WORKTREE
                || (!REVIEWABLE.contains(lease.getWorktreeState())
                && lease.getWorktreeState()
                != WorktreeState.CLEANUP_PENDING)) {
            throw new IllegalStateException("当前没有可放弃的临时修改");
        }
        cleanup(lease, "用户已放弃修改，临时 Worktree 已清理", true);
        return TaskWorktreeResponse.from(lease);
    }

    /** Reconciles persisted leases before durable Runs are marked paused. */
    public void recoverAfterRestart(Set<String> activeTaskIds) {
        mutationGate.execute(() -> recoverAfterRestartLocked(activeTaskIds));
    }

    private synchronized void recoverAfterRestartLocked(
            Set<String> activeTaskIds
    ) {
        Set<String> active = activeTaskIds == null ? Set.of()
                : Set.copyOf(activeTaskIds);
        for (TaskWorktree lease : worktreeMapper.selectList(null)) {
            try {
                recover(lease, active.contains(lease.getTaskId()));
            } catch (RuntimeException error) {
                LOGGER.warn("Failed to recover task worktree {}",
                        lease.getTaskId(), error);
                if (lease.getWorktreeState() != WorktreeState.BRANCHED) {
                    fail(lease, safeMessage(error));
                }
            }
        }
        recoverOrphanDirectories();
    }

    @Scheduled(
            fixedDelayString = "${lumora.worktrees.cleanup-retry-ms:30000}",
            initialDelayString = "${lumora.worktrees.cleanup-retry-ms:30000}"
    )
    public void retryPendingCleanup() {
        mutationGate.execute(this::retryPendingCleanupLocked);
    }

    private synchronized void retryPendingCleanupLocked() {
        for (TaskWorktree lease : worktreeMapper.selectList(
                Wrappers.<TaskWorktree>lambdaQuery()
                        .eq(TaskWorktree::getWorktreeState,
                                WorktreeState.CLEANUP_PENDING)
        )) {
            if (lease.getWorktreeState() == WorktreeState.CLEANUP_PENDING) {
                cleanup(lease, "临时 Worktree 已完成延迟清理");
            }
        }
    }

    private void recoverOrphanDirectories() {
        if (!Files.isDirectory(managedRoot)) return;
        Set<Path> knownPaths = knownWorktreeRoots();
        try (var paths = Files.walk(managedRoot, 2)) {
            for (Path candidate : paths
                    .filter(path -> !path.equals(managedRoot))
                    .filter(path -> Files.isRegularFile(path.resolve(".git")))
                    .toList()) {
                Path normalizedCandidate = candidate.toAbsolutePath()
                        .normalize();
                if (knownPaths.contains(normalizedCandidate)
                        || !git.isRepository(normalizedCandidate)) {
                    continue;
                }
                recoverOrphan(normalizedCandidate);
            }
        } catch (IOException error) {
            LOGGER.warn("Failed to scan managed worktree root {}",
                    managedRoot, error);
        }
    }

    private void recoverOrphan(Path candidate) {
        try {
            String branch = git.currentBranch(candidate);
            if (!branch.isBlank()) {
                LOGGER.info(
                        "Preserving branch-attached worktree {} on branch {}",
                        candidate, branch
                );
                return;
            }
            Snapshot snapshot = git.snapshot(candidate);
            List<String> ignoredEffects = git.ignoredUntracked(candidate, 100);
            Path primary = git.primaryWorktree(candidate);
            String head = git.head(candidate);
            String headTree = head.isBlank() ? ""
                    : git.commitTree(candidate, head);
            if (ignoredEffects.isEmpty()
                    && !headTree.isBlank()
                    && snapshot.tree().equals(headTree)) {
                git.removeWorktree(primary, candidate);
                LOGGER.info("Removed clean orphan worktree {}", candidate);
                return;
            }
            String taskId = candidate.getFileName().toString();
            if (taskMapper.selectById(taskId) == null || head.isBlank()) {
                LOGGER.warn(
                        "Preserving dirty orphan worktree without task association: {}",
                        candidate
                );
                return;
            }
            TaskWorktree recovered = newLease(
                    taskId, TaskWorkspaceMode.WORKTREE,
                    primary, candidate, primary, head, headTree,
                    WorktreeState.WAITING_REVIEW
            );
            recovered.setManagedByLumora(true);
            recovered.setResultTree(snapshot.tree());
            recovered.setReason(ignoredEffects.isEmpty()
                    ? "检测到应用异常退出前遗留的修改；原始基线信息不完整，请审阅后处理"
                    : "检测到 " + ignoredEffects.size()
                    + " 个被 Git 忽略的遗留文件；已保留 Worktree 等待处理");
            save(recovered);
            keepResultTree(recovered, snapshot.tree());
        } catch (RuntimeException error) {
            LOGGER.warn("Failed to inspect orphan worktree {}",
                    candidate, error);
        }
    }

    private Set<Path> knownWorktreeRoots() {
        Set<Path> result = new HashSet<>();
        for (TaskWorktree lease : worktreeMapper.selectList(null)) {
            if (lease.getWorkspaceMode() != TaskWorkspaceMode.WORKTREE) {
                continue;
            }
            try {
                result.add(worktreeRoot(lease));
            } catch (RuntimeException error) {
                LOGGER.warn(
                        "Ignoring malformed worktree path for task {}",
                        lease.getTaskId(), error
                );
            }
        }
        return Set.copyOf(result);
    }

    private void recover(TaskWorktree lease, boolean taskIsActive) {
        if (lease.getWorkspaceMode() == TaskWorkspaceMode.LOCAL) {
            if (!taskIsActive && lease.getWorktreeState()
                    == WorktreeState.ACTIVE) {
                updateState(lease, WorktreeState.RELEASED, "");
            }
            return;
        }
        Path physicalRoot = worktreeRoot(lease);
        if (!lease.getWorktreeState().retainsWorkspace()) {
            if (Files.isDirectory(physicalRoot)
                    && lease.getWorkspaceMode()
                    == TaskWorkspaceMode.WORKTREE) {
                recoverDetachedRecord(lease);
            }
            return;
        }
        if (!Files.isDirectory(physicalRoot)) {
            if (lease.getWorktreeState() == WorktreeState.CLEANUP_PENDING) {
                markRemoved(lease, "遗留 Worktree 已完成清理");
            } else {
                fail(lease, "遗留 Worktree 目录不存在");
            }
            return;
        }
        if (lease.getWorktreeState() == WorktreeState.CLEANUP_PENDING) {
            cleanup(lease, "遗留 Worktree 已完成清理");
            return;
        }
        if (taskIsActive || lease.getWorktreeState()
                == WorktreeState.BRANCHED
                || REVIEWABLE.contains(lease.getWorktreeState())) {
            return;
        }
        Snapshot current = git.snapshot(physicalRoot);
        List<String> ignoredEffects = git.ignoredUntracked(physicalRoot, 100);
        lease.setResultTree(current.tree());
        keepResultTree(lease, current.tree());
        if (current.tree().equals(lease.getBaseTree())
                && ignoredEffects.isEmpty()) {
            cleanup(lease, "应用恢复时确认无修改，临时 Worktree 已清理");
        } else {
            updateState(
                    lease, WorktreeState.WAITING_REVIEW,
                    ignoredEffects.isEmpty()
                            ? "应用重启后已恢复隔离修改，等待用户处理"
                            : "应用重启后检测到 " + ignoredEffects.size()
                            + " 个被 Git 忽略的文件，已保留等待处理"
            );
        }
    }

    private void recoverDetachedRecord(TaskWorktree lease) {
        Path root = worktreeRoot(lease);
        Snapshot current = git.snapshot(root);
        List<String> ignoredEffects = git.ignoredUntracked(root, 100);
        if (!lease.getBaseTree().isBlank()
                && current.tree().equals(lease.getBaseTree())
                && ignoredEffects.isEmpty()) {
            cleanup(lease, "遗留的干净 Worktree 已完成清理");
            return;
        }
        lease.setResultTree(current.tree());
        keepResultTree(lease, current.tree());
        updateState(
                lease, WorktreeState.WAITING_REVIEW,
                ignoredEffects.isEmpty()
                        ? "检测到未完成清理的 Worktree 修改，已恢复并等待审阅"
                        : "检测到 " + ignoredEffects.size()
                        + " 个被 Git 忽略的遗留文件，已恢复并等待处理"
        );
    }

    private void rollbackLocal(
            Path source,
            Snapshot before,
            RuntimeException original
    ) {
        try {
            String currentTree = git.snapshot(source).tree();
            git.materializeTree(source, currentTree, before.tree());
            Snapshot restored = git.snapshot(source);
            if (!restored.tree().equals(before.tree())
                    || !restored.head().equals(before.head())
                    || !restored.indexTree().equals(before.indexTree())) {
                original.addSuppressed(new IllegalStateException(
                        "Local 回滚校验失败"
                ));
            }
        } catch (RuntimeException rollbackError) {
            original.addSuppressed(rollbackError);
        }
    }

    private TaskWorktreeResponse selectLocal(String taskId, Path source) {
        String repositoryRoot = "";
        String head = "";
        if (git.isRepository(source)) {
            Path repository = git.repositoryRoot(source);
            repositoryRoot = repository.toString();
            head = git.head(repository);
        }
        saveLocal(taskId, source, repositoryRoot, head);
        TaskWorktree saved = require(taskId);
        updateState(saved, WorktreeState.RELEASED, "已选择共享 Local");
        return TaskWorktreeResponse.from(saved);
    }

    private TaskWorktreeResponse selectNewWorktree(
            String taskId,
            Path source,
            TaskWorktree previous
    ) {
        if (!git.isRepository(source)) {
            throw new IllegalStateException(
                    "显式 Worktree 环境要求任务工作区属于 Git 仓库"
            );
        }
        Path repository = git.repositoryRoot(source);
        TaskWorktree preference = newLease(
                taskId, TaskWorkspaceMode.WORKTREE,
                source, source, repository,
                git.head(repository), "", WorktreeState.RELEASED
        );
        preference.setManagedByLumora(true);
        inheritSettings(preference, previous);
        preference.setReason("已选择显式 Worktree；将在下一次 Run 启动时创建");
        save(preference);
        return TaskWorktreeResponse.from(preference);
    }

    private TaskWorktreeResponse adoptExisting(
            String taskId,
            Path source,
            String existingWorktreePath,
            TaskWorktree previous
    ) {
        if (!git.isRepository(source)) {
            throw new IllegalStateException("源工作区不是 Git 仓库");
        }
        Path selected = normalized(existingWorktreePath);
        requireDirectory(selected, "指定的 Worktree 不存在");
        if (!git.isRepository(selected)) {
            throw new IllegalArgumentException("指定目录不是 Git Worktree");
        }
        Path sourcePrimary = git.primaryWorktree(source);
        Path selectedPrimary = git.primaryWorktree(selected);
        if (!sourcePrimary.equals(selectedPrimary)) {
            throw new IllegalArgumentException("指定 Worktree 不属于任务仓库");
        }
        Path sourceRoot = git.repositoryRoot(source);
        Path selectedRoot = git.repositoryRoot(selected);
        if (selectedRoot.equals(sourcePrimary)) {
            throw new IllegalArgumentException("主工作树不能作为现有 Worktree 选择");
        }
        if (!Files.isRegularFile(selectedRoot.resolve(".git"))) {
            throw new IllegalArgumentException("指定目录不是 linked Worktree");
        }
        boolean leased = worktreeMapper.selectList(
                Wrappers.<TaskWorktree>lambdaQuery()
                        .eq(TaskWorktree::getWorkspaceMode,
                                TaskWorkspaceMode.WORKTREE)
        ).stream()
                .filter(item -> !item.getTaskId().equals(taskId))
                .filter(item -> item.getWorktreeState().retainsWorkspace())
                .anyMatch(item -> samePath(
                        worktreeRoot(item).toString(), selectedRoot.toString()
                ));
        if (leased) {
            throw new IllegalStateException("指定 Worktree 已由其他任务占用");
        }
        Path relative = sourceRoot.relativize(source);
        Path effective = selectedRoot.resolve(relative).normalize();
        requireDirectory(effective, "指定 Worktree 中不存在任务子目录");
        Snapshot snapshot = git.snapshot(selectedRoot);
        TaskWorktree lease = newLease(
                taskId, TaskWorkspaceMode.WORKTREE,
                source, effective, sourceRoot,
                snapshot.head(), snapshot.tree(), WorktreeState.BRANCHED
        );
        lease.setManagedByLumora(false);
        lease.setBranchName(git.currentBranch(selectedRoot));
        lease.setReason("已选择现有 Worktree");
        inheritSettings(lease, previous);
        lease.setAutoApplyWhenClean(false);
        save(lease);
        keepResultTree(lease, snapshot.tree());
        return TaskWorktreeResponse.from(lease);
    }

    private void inheritSettings(
            TaskWorktree target,
            TaskWorktree previous
    ) {
        if (previous == null) return;
        target.setAutoApplyWhenClean(previous.isAutoApplyWhenClean());
        target.setSettingsRevision(previous.getSettingsRevision());
    }

    private void ensureNoActiveRun(String taskId) {
        boolean active = runMapper.selectList(
                Wrappers.<ConversationRun>lambdaQuery()
                        .eq(ConversationRun::getTaskId, taskId)
        ).stream().anyMatch(run -> run.getStatus().isActive());
        if (active) {
            throw new IllegalStateException(
                    "任务仍有活动 Run，进入安全状态后才能切换执行环境"
            );
        }
    }

    private void attemptAutoApply(TaskWorktree lease) {
        try {
            apply(lease.getTaskId());
        } catch (RuntimeException error) {
            TaskWorktree current = worktreeMapper.selectById(lease.getTaskId());
            if (current != null
                    && current.getWorktreeState() != WorktreeState.CONFLICTED
                    && current.getWorktreeState() != WorktreeState.REMOVED) {
                updateState(
                        current, WorktreeState.WAITING_REVIEW,
                        "自动应用未完成，修改仍安全保留: " + safeMessage(error)
                );
            }
        }
    }

    private void autoApplyReady(String repositoryRoot) {
        if (valueOrEmpty(repositoryRoot).isBlank()) return;
        List<TaskWorktree> candidates = worktreeMapper.selectList(
                Wrappers.<TaskWorktree>lambdaQuery()
                        .eq(TaskWorktree::getWorkspaceMode,
                                TaskWorkspaceMode.WORKTREE)
                        .eq(TaskWorktree::getWorktreeState,
                                WorktreeState.WAITING_REVIEW)
        );
        for (TaskWorktree candidate : candidates) {
            if (candidate.isAutoApplyWhenClean()
                    && samePath(candidate.getRepositoryRoot(), repositoryRoot)
                    && !hasOtherActiveLocal(
                    candidate.getTaskId(), repositoryRoot)) {
                attemptAutoApply(candidate);
            }
        }
    }

    private boolean refreshChangedReview(TaskWorktree lease) {
        Snapshot current = git.snapshot(worktreeRoot(lease));
        if (current.tree().equals(lease.getResultTree())) return false;
        lease.setResultTree(current.tree());
        keepResultTree(lease, current.tree());
        if (lease.isAutoApplyWhenClean()) {
            lease.setAutoApplyWhenClean(false);
            lease.setSettingsRevision(lease.getSettingsRevision() + 1L);
        }
        updateState(lease, WorktreeState.WAITING_REVIEW,
                "Worktree 内容已变化，已保留修改并更新差异；请审阅后再次操作");
        return true;
    }

    private void cleanup(TaskWorktree lease, String reason) {
        cleanup(lease, reason, false);
    }

    private void cleanup(TaskWorktree lease, String reason, boolean discard) {
        if (!lease.isManagedByLumora()) {
            updateState(
                    lease,
                    WorktreeState.BRANCHED,
                    "外部采用的 Worktree 已保留；Lumora 不会删除用户目录"
            );
            return;
        }
        try {
            Path physicalRoot = worktreeRoot(lease);
            if (Files.exists(physicalRoot)) {
                validateRemovalTarget(lease, physicalRoot);
                if (!discard) {
                    if (refreshChangedReview(lease)) return;
                    if (!git.ignoredUntracked(physicalRoot, 100).isEmpty()) {
                        updateState(lease, WorktreeState.WAITING_REVIEW,
                                "清理前发现被 Git 忽略的文件，已保留 Worktree");
                        return;
                    }
                }
                git.removeWorktree(
                        normalized(lease.getRepositoryRoot()),
                        physicalRoot
                );
            }
            deleteResultReference(lease);
            deleteBaseReference(lease);
            markRemoved(lease, reason);
        } catch (RuntimeException error) {
            updateState(
                    lease, WorktreeState.CLEANUP_PENDING,
                    "清理将在稍后重试: " + safeMessage(error)
            );
        }
    }

    private void markRemoved(TaskWorktree lease, String reason) {
        lease.setCleanedAt(clock.instant());
        updateState(lease, WorktreeState.REMOVED, reason);
    }

    private void saveLocal(
            String taskId,
            Path source,
            String repositoryRoot,
            String baseCommit
    ) {
        TaskWorktree local = newLease(
                taskId, TaskWorkspaceMode.LOCAL, source, source,
                repositoryRoot.isBlank() ? source : Path.of(repositoryRoot),
                baseCommit, "", WorktreeState.ACTIVE
        );
        save(local);
    }

    private TaskWorktree newLease(
            String taskId,
            TaskWorkspaceMode mode,
            Path source,
            Path effective,
            Path repositoryRoot,
            String baseCommit,
            String baseTree,
            WorktreeState state
    ) {
        Instant now = clock.instant();
        TaskWorktree result = new TaskWorktree();
        result.setTaskId(taskId);
        result.setWorkspaceMode(mode);
        result.setSourceWorkspacePath(source.toString());
        result.setEffectiveWorkspacePath(effective.toString());
        result.setRepositoryRoot(repositoryRoot.toString());
        result.setBaseCommit(valueOrEmpty(baseCommit));
        result.setBaseTree(valueOrEmpty(baseTree));
        result.setResultTree(valueOrEmpty(baseTree));
        result.setWorktreeState(state);
        result.setBranchName("");
        result.setReason("");
        result.setManagedByLumora(false);
        result.setCreatedAt(now);
        result.setUpdatedAt(now);
        return result;
    }

    private void save(TaskWorktree lease) {
        TaskWorktree existing = worktreeMapper.selectById(lease.getTaskId());
        if (existing == null) {
            worktreeMapper.insert(lease);
        } else {
            lease.setCreatedAt(existing.getCreatedAt());
            worktreeMapper.updateById(lease);
        }
    }

    private boolean hasOtherActiveLocal(
            String taskId,
            String repositoryRoot
    ) {
        if (repositoryRoot == null || repositoryRoot.isBlank()) return false;
        return worktreeMapper.selectList(
                Wrappers.<TaskWorktree>lambdaQuery()
                        .eq(TaskWorktree::getWorkspaceMode,
                                TaskWorkspaceMode.LOCAL)
                        .eq(TaskWorktree::getWorktreeState,
                                WorktreeState.ACTIVE)
        ).stream()
                .filter(item -> item.getWorkspaceMode()
                        == TaskWorkspaceMode.LOCAL)
                .filter(item -> item.getWorktreeState()
                        == WorktreeState.ACTIVE)
                .filter(item -> !item.getTaskId().equals(taskId))
                .anyMatch(item -> samePath(
                        item.getRepositoryRoot(), repositoryRoot
                ));
    }

    private void ensureCapacity() {
        long retained = worktreeMapper.selectList(
                Wrappers.<TaskWorktree>lambdaQuery()
                        .eq(TaskWorktree::getWorkspaceMode,
                                TaskWorkspaceMode.WORKTREE)
        ).stream()
                .filter(item -> item.getWorkspaceMode()
                        == TaskWorkspaceMode.WORKTREE)
                .filter(TaskWorktree::isManagedByLumora)
                .filter(item -> TEMPORARY_RETAINED.contains(
                        item.getWorktreeState()
                ))
                .count();
        if (retained >= maxRetained) {
            throw new IllegalStateException(
                    "已保留的临时 Worktree 达到上限 " + maxRetained
                            + "，请先处理待审阅任务"
            );
        }
    }

    private boolean canReuse(TaskWorktree lease) {
        return lease != null
                && lease.getWorkspaceMode() == TaskWorkspaceMode.WORKTREE
                && lease.getWorktreeState().retainsWorkspace()
                && lease.getWorktreeState()
                != WorktreeState.CLEANUP_PENDING;
    }

    private TaskWorktree requireReviewable(String taskId) {
        TaskWorktree lease = require(taskId);
        if (lease.getWorkspaceMode() != TaskWorkspaceMode.WORKTREE
                || !REVIEWABLE.contains(lease.getWorktreeState())) {
            throw new IllegalStateException("当前任务没有待处理的 Worktree 修改");
        }
        return lease;
    }

    private void rejectIgnoredEffects(TaskWorktree lease) {
        Path root = worktreeRoot(lease);
        List<String> ignored = git.ignoredUntracked(root, 100);
        if (!ignored.isEmpty()) {
            throw new IllegalStateException(
                    "Worktree 包含被 Git 忽略的新增文件，Git tree 无法安全"
                            + "保存或应用；请先移动或删除这些文件，或选择放弃修改"
            );
        }
    }

    private TaskWorktree require(String taskId) {
        TaskWorktree lease = worktreeMapper.selectById(taskId);
        if (lease == null) {
            throw new IllegalArgumentException("任务 Worktree 记录不存在");
        }
        return lease;
    }

    private void updateState(
            TaskWorktree lease,
            WorktreeState state,
            String reason
    ) {
        lease.setWorktreeState(state);
        lease.setReason(valueOrEmpty(reason));
        lease.setUpdatedAt(clock.instant());
        worktreeMapper.updateById(lease);
    }

    private void advanceRevision(Path workspace) {
        if (workspaceLedger != null) {
            workspaceLedger.advanceRevision(workspace.toString());
        }
    }

    private void fail(TaskWorktree lease, String reason) {
        updateState(lease, WorktreeState.FAILED, reason);
    }

    private void keepResultTree(TaskWorktree lease, String tree) {
        git.keepTree(
                normalized(lease.getRepositoryRoot()),
                resultReference(lease.getTaskId()), tree
        );
    }

    private void deleteResultReference(TaskWorktree lease) {
        if (!lease.getRepositoryRoot().isBlank()) {
            git.deleteReference(
                    normalized(lease.getRepositoryRoot()),
                    resultReference(lease.getTaskId())
            );
        }
    }

    private void deleteBaseReference(TaskWorktree lease) {
        if (!lease.getRepositoryRoot().isBlank()) {
            git.deleteReference(
                    normalized(lease.getRepositoryRoot()),
                    baseReference(lease.getTaskId())
            );
        }
    }

    private boolean usesSyntheticBase(TaskWorktree lease) {
        return lease.getBaseCommit().equals(git.referenceTarget(
                normalized(lease.getRepositoryRoot()),
                baseReference(lease.getTaskId())
        ));
    }

    private String resultReference(String taskId) {
        return "refs/lumora/worktrees/"
                + taskId.replaceAll("[^A-Za-z0-9._-]", "-") + "/result";
    }

    private String baseReference(String taskId) {
        return "refs/lumora/worktrees/"
                + taskId.replaceAll("[^A-Za-z0-9._-]", "-") + "/base";
    }

    private Path destination(Path repositoryRoot, String taskId) {
        String safeTaskId = taskId.replaceAll("[^A-Za-z0-9._-]", "-");
        Path result = managedRoot.resolve(repositoryHash(repositoryRoot))
                .resolve(safeTaskId).toAbsolutePath().normalize();
        if (!result.startsWith(managedRoot) || result.equals(managedRoot)) {
            throw new IllegalStateException("Worktree 路径超出托管目录");
        }
        return result;
    }

    private String repositoryHash(Path repositoryRoot) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(
                    repositoryRoot.toString().toLowerCase()
                            .getBytes(StandardCharsets.UTF_8)
            );
            StringBuilder result = new StringBuilder();
            for (int index = 0; index < 6; index += 1) {
                result.append(String.format("%02x", digest[index]));
            }
            return result.toString();
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("当前环境不支持 SHA-256", error);
        }
    }

    private Path requiredWorkspace(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalStateException("当前任务没有可执行的工作区");
        }
        Path path = normalized(value);
        requireDirectory(path, "任务工作区不存在");
        return path;
    }

    private void requireDirectory(Path path, String message) {
        if (!Files.isDirectory(path)) throw new IllegalStateException(message);
    }

    private Path normalized(String path) {
        return Path.of(path).toAbsolutePath().normalize();
    }

    private Path worktreeRoot(TaskWorktree lease) {
        Path effective = normalized(lease.getEffectiveWorkspacePath());
        Path current = effective;
        while (current != null) {
            if (Files.isRegularFile(current.resolve(".git"))) {
                return current.toAbsolutePath().normalize();
            }
            current = current.getParent();
        }
        return destination(
                normalized(lease.getRepositoryRoot()), lease.getTaskId()
        );
    }

    private void validateRemovalTarget(
            TaskWorktree lease,
            Path physicalRoot
    ) {
        requireManagedTemporary(lease, "清理");
        Path primary = normalized(lease.getRepositoryRoot());
        Path effective = normalized(lease.getEffectiveWorkspacePath());
        if (physicalRoot.equals(primary)
                || !effective.startsWith(physicalRoot)
                || !Files.isRegularFile(physicalRoot.resolve(".git"))) {
            throw new IllegalStateException(
                    "拒绝清理无法验证归属的 Worktree 路径"
            );
        }
    }

    private void requireManagedTemporary(
            TaskWorktree lease,
            String action
    ) {
        if (!lease.isManagedByLumora()) {
            throw new IllegalStateException(
                    "外部采用的 Worktree 由用户管理，Lumora 不能"
                            + action + "或删除该目录"
            );
        }
    }

    private boolean samePath(String first, String second) {
        try {
            return normalized(first).equals(normalized(second));
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    private String requireBranchName(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("分支名称不能为空");
        }
        return value.trim();
    }

    private String safeMessage(Throwable error) {
        String message = error == null ? null : error.getMessage();
        return message == null || message.isBlank()
                ? "Worktree 操作失败" : message;
    }

    private String valueOrEmpty(String value) {
        return value == null ? "" : value.trim();
    }

    public record ChangeRange(
            String taskId,
            String status,
            String repositoryRoot,
            String reason,
            String beforeTree,
            String afterTree
    ) {
    }
}
