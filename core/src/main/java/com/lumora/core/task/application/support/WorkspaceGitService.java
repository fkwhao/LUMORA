package com.lumora.core.task.application.support;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.lumora.core.conversation.api.dto.response.ConversationFileChangeResponse;
import com.lumora.core.conversation.api.dto.response.ConversationRunChangesResponse;
import com.lumora.core.conversation.application.support.GitRunChangeService;
import com.lumora.core.conversation.application.support.WorkspaceChangeLedgerService;
import com.lumora.core.conversation.domain.entity.ConversationRun;
import com.lumora.core.conversation.domain.model.ConversationRunStatus;
import com.lumora.core.conversation.infrastructure.persistence.ConversationRunMapper;
import com.lumora.core.shared.infrastructure.git.GitWorkspaceOperations;
import com.lumora.core.shared.infrastructure.git.GitWorkspaceMutationGate;
import com.lumora.core.shared.infrastructure.git.GitWorkspaceOperations.Branch;
import com.lumora.core.shared.infrastructure.git.GitWorkspaceOperations.Commit;
import com.lumora.core.shared.infrastructure.git.GitWorkspaceOperations.Snapshot;
import com.lumora.core.shared.infrastructure.git.GitWorkspaceOperations.Status;
import com.lumora.core.shared.infrastructure.git.GitWorkspaceOperations.Worktree;
import com.lumora.core.task.api.dto.request.GitChangesRequest;
import com.lumora.core.task.api.dto.request.GitCheckoutRequest;
import com.lumora.core.task.api.dto.request.GitCreateBranchRequest;
import com.lumora.core.task.api.dto.response.GitBranchSummaryResponse;
import com.lumora.core.task.api.dto.response.GitCommitSummaryResponse;
import com.lumora.core.task.api.dto.response.GitHistoryResponse;
import com.lumora.core.task.api.dto.response.GitReviewChangesResponse;
import com.lumora.core.task.api.dto.response.WorkspaceContextResponse;
import com.lumora.core.task.api.dto.response.WorkspaceEnvironmentSummaryResponse;
import com.lumora.core.task.api.dto.response.WorkspaceGitStatusResponse;
import com.lumora.core.task.application.service.TaskService;
import com.lumora.core.task.domain.entity.AgentTask;
import com.lumora.core.task.domain.entity.TaskWorktree;
import com.lumora.core.task.domain.model.TaskWorkspaceMode;
import com.lumora.core.task.infrastructure.persistence.TaskMapper;
import com.lumora.core.task.infrastructure.persistence.TaskWorktreeMapper;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Single Core authority for renderer-facing Workspace and Git projections.
 * The renderer can choose from explicit operations, but never supplies an
 * arbitrary Git command or filesystem deletion target.
 */
@Service
public class WorkspaceGitService {

    private static final int DEFAULT_HISTORY_LIMIT = 30;
    private static final int MAX_HISTORY_LIMIT = 200;

    private final TaskService taskService;
    private final TaskMapper taskMapper;
    private final TaskWorktreeMapper worktreeMapper;
    private final TaskWorktreeService taskWorktreeService;
    private final ConversationRunMapper runMapper;
    private final GitWorkspaceOperations git;
    private final GitWorkspaceMutationGate mutationGate;
    private final GitRunChangeService runChanges;
    private final WorkspaceChangeLedgerService workspaceLedger;
    private final Clock clock;

    public WorkspaceGitService(
            TaskService taskService,
            TaskMapper taskMapper,
            TaskWorktreeMapper worktreeMapper,
            TaskWorktreeService taskWorktreeService,
            ConversationRunMapper runMapper,
            GitWorkspaceOperations git,
            GitWorkspaceMutationGate mutationGate,
            GitRunChangeService runChanges,
            WorkspaceChangeLedgerService workspaceLedger,
            Clock clock
    ) {
        this.taskService = taskService;
        this.taskMapper = taskMapper;
        this.worktreeMapper = worktreeMapper;
        this.taskWorktreeService = taskWorktreeService;
        this.runMapper = runMapper;
        this.git = git;
        this.mutationGate = mutationGate;
        this.runChanges = runChanges;
        this.workspaceLedger = workspaceLedger;
        this.clock = clock;
    }

    public WorkspaceContextResponse inspect(
            String workspacePath,
            String taskId
    ) {
        if (taskId != null && !taskId.isBlank()) {
            return contextForTask(taskId);
        }
        Path workspace = requiredDirectory(workspacePath);
        return context(new ResolvedWorkspace(
                null, null, workspace, workspace,
                TaskWorkspaceMode.LOCAL, false
        ));
    }

    public WorkspaceContextResponse contextForTask(
            String taskId
    ) {
        AgentTask task = taskService.getTask(taskId);
        Path taskPath = requiredDirectory(task.getWorkspacePath());
        TaskWorktree lease = worktreeMapper.selectById(taskId);
        Path source = taskPath;
        Path effective = taskPath;
        TaskWorkspaceMode mode = TaskWorkspaceMode.LOCAL;
        boolean physicalWorktree = false;
        if (lease != null) {
            if (!blank(lease.getSourceWorkspacePath())) {
                source = requiredDirectory(lease.getSourceWorkspacePath());
            }
            mode = lease.getWorkspaceMode();
            if (mode == TaskWorkspaceMode.WORKTREE
                    && lease.getWorktreeState().retainsWorkspace()
                    && !blank(lease.getEffectiveWorkspacePath())) {
                effective = requiredDirectory(
                        lease.getEffectiveWorkspacePath()
                );
                physicalWorktree = !samePath(source, effective);
            } else {
                effective = source;
            }
        }
        return context(new ResolvedWorkspace(
                task, lease, source, effective, mode, physicalWorktree
        ));
    }

    public void assertExpectedRevision(
            String taskId,
            Long expectedRevision
    ) {
        if (expectedRevision == null) return;
        ResolvedWorkspace resolved = resolveTask(taskId);
        long current = currentRevision(resolved.effective());
        if (current != expectedRevision) {
            throw new IllegalStateException(
                    "工作区已发生变化，请刷新后重试"
            );
        }
    }

    public List<GitBranchSummaryResponse> branches(
            String taskId
    ) {
        ResolvedWorkspace resolved = resolveTask(taskId);
        if (!git.isRepository(resolved.effective())) return List.of();
        return branchResponses(git.branches(resolved.effective()),
                resolved.effective());
    }

    public WorkspaceContextResponse checkout(
            String taskId,
            GitCheckoutRequest request
    ) {
        return mutationGate.execute(() -> checkoutInside(taskId, request));
    }

    private WorkspaceContextResponse checkoutInside(
            String taskId,
            GitCheckoutRequest request
    ) {
        ResolvedWorkspace resolved = resolveTask(taskId);
        Path physicalRoot = requireGitRoot(resolved.effective());
        assertNoActiveRunOn(physicalRoot);
        assertRevision(physicalRoot, request.expectedRevision());
        String currentHead = git.head(physicalRoot);
        if (request.expectedHead() != null
                && !request.expectedHead().trim().equals(currentHead)) {
            throw new IllegalStateException(
                    "Git HEAD 已发生变化，请刷新后重试"
            );
        }
        git.checkoutBranch(physicalRoot, request.branchName().trim());
        taskWorktreeService.onBranchCheckedOut(
                taskId, git.currentBranch(physicalRoot)
        );
        workspaceLedger.advanceRevision(physicalRoot.toString());
        return contextForTask(taskId);
    }

    public WorkspaceContextResponse createBranch(
            String taskId,
            GitCreateBranchRequest request
    ) {
        return mutationGate.execute(() -> createBranchInside(taskId, request));
    }

    private WorkspaceContextResponse createBranchInside(
            String taskId,
            GitCreateBranchRequest request
    ) {
        ResolvedWorkspace resolved = resolveTask(taskId);
        Path physicalRoot = requireGitRoot(resolved.effective());
        assertNoActiveRunOn(physicalRoot);
        assertRevision(physicalRoot, request.expectedRevision());
        git.createBranch(
                physicalRoot,
                request.branchName().trim(),
                empty(request.startPoint()),
                Boolean.TRUE.equals(request.checkout())
        );
        if (Boolean.TRUE.equals(request.checkout())) {
            taskWorktreeService.onBranchCheckedOut(
                    taskId, git.currentBranch(physicalRoot)
            );
        }
        workspaceLedger.advanceRevision(physicalRoot.toString());
        return contextForTask(taskId);
    }

    public GitHistoryResponse history(
            String taskId,
            Integer requestedLimit,
            String cursor
    ) {
        ResolvedWorkspace resolved = resolveTask(taskId);
        if (!git.isRepository(resolved.effective())) {
            return new GitHistoryResponse(List.of(), null);
        }
        Path root = git.repositoryRoot(resolved.effective());
        int limit = requestedLimit == null
                ? DEFAULT_HISTORY_LIMIT
                : Math.max(1, Math.min(requestedLimit, MAX_HISTORY_LIMIT));
        List<Commit> page = git.history(root, limit + 1, empty(cursor));
        String nextCursor = page.size() > limit
                ? page.get(limit - 1).sha() : null;
        List<GitCommitSummaryResponse> commits = page.stream()
                .limit(limit)
                .map(this::commitResponse)
                .toList();
        return new GitHistoryResponse(commits, nextCursor);
    }

    public GitReviewChangesResponse changes(
            String taskId,
            GitChangesRequest request
    ) {
        taskService.getTask(taskId);
        ReviewScope scope = ReviewScope.parse(request.scope());
        if (scope == ReviewScope.LAST_RUN) {
            return lastRunChanges(taskId, request.runId());
        }
        ResolvedWorkspace resolved = resolveTask(taskId);
        if (!git.isRepository(resolved.effective())) {
            return emptyChanges(
                    scope, "当前工作区不是 Git 仓库",
                    resolved.effective().toString(), request
            );
        }
        Path root = git.repositoryRoot(resolved.effective());
        Snapshot snapshot = git.snapshot(root);
        String emptyTree = git.emptyTree(root);
        String headTree = snapshot.head().isBlank()
                ? emptyTree : git.commitTree(root, snapshot.head());
        String beforeTree;
        String afterTree;
        String label;
        String reason = "";
        String commitSha = null;
        String baseRef = null;
        String headRef = null;
        switch (scope) {
            case UNCOMMITTED -> {
                beforeTree = headTree;
                afterTree = snapshot.tree();
                label = "全部未提交";
            }
            case UNSTAGED -> {
                beforeTree = snapshot.indexTree();
                afterTree = snapshot.tree();
                label = "未暂存";
            }
            case STAGED -> {
                beforeTree = headTree;
                afterTree = snapshot.indexTree();
                label = "已暂存";
            }
            case COMMIT -> {
                commitSha = git.resolveCommit(root, request.commitSha());
                afterTree = git.commitTree(root, commitSha);
                if (!blank(request.baseCommit())) {
                    beforeTree = git.resolveTree(root, request.baseCommit());
                } else {
                    Commit commit = git.commit(root, commitSha);
                    beforeTree = commit.parentShas().isEmpty()
                            ? emptyTree
                            : git.commitTree(
                            root, commit.parentShas().getFirst()
                    );
                }
                label = "提交 " + shortSha(commitSha);
            }
            case BRANCH_COMPARE -> {
                baseRef = requireRef(request.baseRef(), "baseRef");
                headRef = blank(request.headRef())
                        ? "HEAD" : requireRef(request.headRef(), "headRef");
                beforeTree = git.resolveTree(root, baseRef);
                afterTree = git.resolveTree(root, headRef);
                label = baseRef + " → " + headRef;
            }
            default -> throw new IllegalStateException("不支持的审阅范围");
        }
        List<ConversationFileChangeResponse> files = runChanges.diffTrees(
                root.toString(), beforeTree, afterTree
        );
        return reviewResponse(
                scope, null, commitSha, baseRef, headRef,
                label, root.toString(), reason, files, clock.instant()
        );
    }

    public List<WorkspaceEnvironmentSummaryResponse> worktrees(
            String taskId
    ) {
        ResolvedWorkspace resolved = resolveTask(taskId);
        if (!git.isRepository(resolved.source())) return List.of();
        return worktreeResponses(resolved);
    }

    public List<WorkspaceEnvironmentSummaryResponse>
    removeWorktree(String taskId, String requestedPath) {
        return mutationGate.execute(
                () -> removeWorktreeInside(taskId, requestedPath)
        );
    }

    private List<WorkspaceEnvironmentSummaryResponse> removeWorktreeInside(
            String taskId,
            String requestedPath
    ) {
        ResolvedWorkspace resolved = resolveTask(taskId);
        Path sourceRoot = requireGitRoot(resolved.source());
        Path primary = git.primaryWorktree(sourceRoot);
        Path target = requiredDirectory(requestedPath);
        Path targetRoot = requireGitRoot(target);
        if (!targetRoot.equals(target)) {
            throw new IllegalArgumentException(
                    "必须指定 Worktree 根目录"
            );
        }
        if (!git.primaryWorktree(targetRoot).equals(primary)) {
            throw new IllegalArgumentException("Worktree 不属于当前仓库");
        }
        if (targetRoot.equals(primary)
                || !Files.isRegularFile(targetRoot.resolve(".git"))) {
            throw new IllegalStateException("拒绝删除 Git 主工作树");
        }
        assertNotInUse(targetRoot);
        git.removeCleanWorktree(primary, targetRoot);
        git.pruneWorktrees(primary);
        return worktreeResponses(resolveTask(taskId));
    }

    public List<WorkspaceEnvironmentSummaryResponse>
    pruneWorktrees(String taskId) {
        return mutationGate.execute(() -> pruneWorktreesInside(taskId));
    }

    private List<WorkspaceEnvironmentSummaryResponse> pruneWorktreesInside(
            String taskId
    ) {
        ResolvedWorkspace resolved = resolveTask(taskId);
        if (!git.isRepository(resolved.source())) return List.of();
        Path primary = git.primaryWorktree(resolved.source());
        git.pruneWorktrees(primary);
        return worktreeResponses(resolveTask(taskId));
    }

    private WorkspaceContextResponse context(ResolvedWorkspace resolved) {
        Path effective = resolved.effective();
        if (!git.isRepository(effective)) {
            WorkspaceEnvironmentSummaryResponse environment =
                    environmentResponse(
                            resolved, effective, null, false, false
                    );
            return new WorkspaceContextResponse(
                    workspaceLedger.currentRevision(effective.toString()),
                    "", resolved.source().toString(), effective.toString(),
                    environment, null, "", false,
                    new WorkspaceGitStatusResponse(
                            true, 0, 0, 0, 0, 0, 0
                    ),
                    List.of(), List.of()
            );
        }
        Path physicalRoot = git.repositoryRoot(effective);
        String head = git.head(physicalRoot);
        String branchName = git.currentBranch(physicalRoot);
        boolean detached = !head.isBlank() && branchName.isBlank();
        List<GitBranchSummaryResponse> branches = branchResponses(
                git.branches(physicalRoot), physicalRoot
        );
        GitBranchSummaryResponse branch = branches.stream()
                .filter(GitBranchSummaryResponse::current)
                .findFirst()
                .orElseGet(() -> branchName.isBlank() ? null
                        : new GitBranchSummaryResponse(
                        branchName, true, false, head,
                        "", 0, 0, physicalRoot.toString()
                ));
        Status status = git.status(physicalRoot);
        WorkspaceEnvironmentSummaryResponse environment =
                environmentResponse(
                        resolved, physicalRoot, branchName,
                        detached, false
                );
        return new WorkspaceContextResponse(
                currentRevision(physicalRoot),
                physicalRoot.toString(), resolved.source().toString(),
                effective.toString(), environment, branch, head, detached,
                statusResponse(status), worktreeResponses(resolved), branches
        );
    }

    private WorkspaceEnvironmentSummaryResponse environmentResponse(
            ResolvedWorkspace resolved,
            Path physicalRoot,
            String branchName,
            boolean detached,
            boolean removable
    ) {
        TaskWorktree lease = resolved.lease();
        String state = lease == null || lease.getWorktreeState() == null
                ? (resolved.mode() == TaskWorkspaceMode.LOCAL
                ? "LOCAL" : "AVAILABLE")
                : lease.getWorktreeState().name();
        String head = git.isRepository(resolved.effective())
                ? git.head(resolved.effective()) : "";
        String label;
        if (resolved.mode() == TaskWorkspaceMode.LOCAL) {
            label = "Local";
        } else if (!resolved.physicalWorktree()) {
            label = "新 Worktree";
        } else if (!blank(branchName)) {
            label = branchName;
        } else if (detached && !head.isBlank()) {
            label = "Detached " + shortSha(head);
        } else {
            label = "Worktree";
        }
        boolean managedByLumora = lease != null
                && resolved.mode() == TaskWorkspaceMode.WORKTREE
                && lease.isManagedByLumora();
        return new WorkspaceEnvironmentSummaryResponse(
                resolved.mode().name(), label,
                resolved.effective().toString(),
                resolved.physicalWorktree() && physicalRoot != null
                        ? physicalRoot.toString() : null,
                empty(branchName), head, state, true, removable,
                resolved.task() == null ? null : resolved.task().getTaskId(),
                lease != null && lease.isAutoApplyWhenClean(),
                lease == null ? 0L : lease.getSettingsRevision(),
                managedByLumora, canAutoApply(lease)
        );
    }

    private List<WorkspaceEnvironmentSummaryResponse> worktreeResponses(
            ResolvedWorkspace resolved
    ) {
        Path lookup = git.isRepository(resolved.source())
                ? resolved.source() : resolved.effective();
        if (!git.isRepository(lookup)) return List.of();
        Path primary = git.primaryWorktree(lookup);
        Path currentRoot = git.repositoryRoot(resolved.effective());
        Map<Path, TaskWorktree> leases = leasesByRoot();
        Set<Path> taskRoots = taskEffectiveRoots();
        Set<Path> activeRunRoots = activeRunRoots();
        List<WorkspaceEnvironmentSummaryResponse> result = new ArrayList<>();
        for (Worktree item : git.worktrees(primary)) {
            TaskWorktree lease = leases.get(normalized(item.path()));
            boolean local = item.path().equals(primary);
            boolean current = item.path().equals(currentRoot);
            String branchName = branchName(item.branchReference());
            boolean removable = !local && !current && !item.locked()
                    && lease == null
                    && safeRemovable(
                            item.path(), taskRoots, activeRunRoots
                    );
            boolean managedByLumora = lease != null
                    && lease.isManagedByLumora();
            String label = local
                    ? "Local"
                    : !branchName.isBlank()
                    ? branchName
                    : "Detached " + shortSha(item.headSha());
            result.add(new WorkspaceEnvironmentSummaryResponse(
                    local ? "LOCAL" : "WORKTREE", label,
                    item.path().toString(),
                    local ? null : item.path().toString(),
                    branchName, item.headSha(),
                    lease == null || lease.getWorktreeState() == null
                            ? (local ? "LOCAL" : "AVAILABLE")
                            : lease.getWorktreeState().name(),
                    current, removable,
                    lease == null ? null : lease.getTaskId(),
                    lease != null && lease.isAutoApplyWhenClean(),
                    lease == null ? 0L : lease.getSettingsRevision(),
                    managedByLumora, canAutoApply(lease)
            ));
        }
        return List.copyOf(result);
    }

    private Map<Path, TaskWorktree> leasesByRoot() {
        Map<Path, TaskWorktree> result = new HashMap<>();
        for (TaskWorktree lease : worktreeMapper.selectList(
                Wrappers.<TaskWorktree>lambdaQuery()
        )) {
            if (lease.getWorkspaceMode() != TaskWorkspaceMode.WORKTREE
                    || !lease.getWorktreeState().retainsWorkspace()
                    || blank(lease.getEffectiveWorkspacePath())) {
                continue;
            }
            Path root = physicalRoot(lease.getEffectiveWorkspacePath());
            if (root != null) result.put(root, lease);
        }
        return result;
    }

    private boolean safeRemovable(
            Path path,
            Set<Path> taskRoots,
            Set<Path> activeRunRoots
    ) {
        try {
            return git.status(path).clean() && !taskRoots.contains(path)
                    && !activeRunRoots.contains(path)
                    && git.ignoredUntracked(path, 1).isEmpty();
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    private boolean canAutoApply(TaskWorktree lease) {
        if (lease == null
                || lease.getWorkspaceMode() != TaskWorkspaceMode.WORKTREE
                || !lease.isManagedByLumora()
                || lease.getWorktreeState() == null) {
            return false;
        }
        return switch (lease.getWorktreeState()) {
            case BRANCHED, REMOVED, FAILED, CLEANUP_PENDING -> false;
            case PROVISIONING, ACTIVE, WAITING_REVIEW, APPLYING,
                    CONFLICTED, RELEASED -> true;
        };
    }

    private void assertNotInUse(Path targetRoot) {
        TaskWorktree activeLease = leasesByRoot().get(targetRoot);
        if (activeLease != null) {
            throw new IllegalStateException(
                    "Worktree 仍由任务 " + activeLease.getTaskId() + " 使用"
            );
        }
        if (isTaskEffectivePath(targetRoot) || hasActiveRunOn(targetRoot)) {
            throw new IllegalStateException("Worktree 仍被任务或 Run 使用");
        }
        if (!git.status(targetRoot).clean()
                || !git.ignoredUntracked(targetRoot, 1).isEmpty()) {
            throw new IllegalStateException(
                    "Worktree 包含未处理修改或被忽略文件，拒绝删除"
            );
        }
    }

    private boolean isTaskEffectivePath(Path targetRoot) {
        return taskEffectiveRoots().contains(targetRoot);
    }

    private Set<Path> taskEffectiveRoots() {
        Map<String, TaskWorktree> leases = new HashMap<>();
        for (TaskWorktree lease : worktreeMapper.selectList(
                Wrappers.<TaskWorktree>lambdaQuery()
        )) {
            leases.put(lease.getTaskId(), lease);
        }
        Set<Path> result = new HashSet<>();
        for (AgentTask task : taskMapper.selectList(
                Wrappers.<AgentTask>lambdaQuery()
        )) {
            TaskWorktree lease = leases.get(task.getTaskId());
            String candidate = lease != null
                    && lease.getWorktreeState().retainsWorkspace()
                    && !blank(lease.getEffectiveWorkspacePath())
                    ? lease.getEffectiveWorkspacePath()
                    : task.getWorkspacePath();
            Path root = physicalRoot(candidate);
            if (root != null) result.add(root);
        }
        return Set.copyOf(result);
    }

    private void assertNoActiveRunOn(Path physicalRoot) {
        if (hasActiveRunOn(physicalRoot)) {
            throw new IllegalStateException(
                    "该工作区仍有活动 Run，进入安全状态后才能切换分支"
            );
        }
    }

    private boolean hasActiveRunOn(Path physicalRoot) {
        return activeRunRoots().contains(physicalRoot);
    }

    private Set<Path> activeRunRoots() {
        Set<Path> result = new HashSet<>();
        runMapper.selectList(
                Wrappers.<ConversationRun>lambdaQuery()
                        .in(ConversationRun::getStatus, List.of(
                                ConversationRunStatus.QUEUED,
                                ConversationRunStatus.RUNNING,
                                ConversationRunStatus.PAUSING,
                                ConversationRunStatus.PAUSED,
                                ConversationRunStatus.WAITING_APPROVAL
                        ))
        ).stream()
                .filter(run -> run.getStatus() != null
                        && run.getStatus().isActive())
                .map(ConversationRun::getWorkspacePath)
                .map(this::physicalRoot)
                .filter(java.util.Objects::nonNull)
                .forEach(result::add);
        return Set.copyOf(result);
    }

    private Path physicalRoot(String workspacePath) {
        if (blank(workspacePath)) return null;
        try {
            Path candidate = Path.of(workspacePath)
                    .toAbsolutePath().normalize();
            return Files.isDirectory(candidate) && git.isRepository(candidate)
                    ? git.repositoryRoot(candidate) : null;
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private GitReviewChangesResponse lastRunChanges(
            String taskId,
            String requestedRunId
    ) {
        String runId = empty(requestedRunId);
        if (runId.isBlank()) {
            runId = runMapper.selectList(
                            Wrappers.<ConversationRun>lambdaQuery()
                                    .eq(ConversationRun::getTaskId, taskId)
                    ).stream()
                    .max(Comparator.comparing(
                            ConversationRun::getCreatedAt,
                            Comparator.nullsFirst(Comparator.naturalOrder())
                    ))
                    .map(ConversationRun::getRunId)
                    .orElse("");
        }
        if (runId.isBlank()) {
            return reviewResponse(
                    ReviewScope.LAST_RUN, null, null, null, null,
                    "本轮", "", "当前任务还没有 Run",
                    List.of(), clock.instant()
            );
        }
        ConversationRunChangesResponse changes = runChanges.changes(
                taskId, runId
        );
        return reviewResponse(
                ReviewScope.LAST_RUN, runId, null, null, null,
                "本轮", changes.repositoryRoot(), changes.reason(),
                changes.files(), changes.capturedAt()
        );
    }

    private GitReviewChangesResponse emptyChanges(
            ReviewScope scope,
            String reason,
            String root,
            GitChangesRequest request
    ) {
        return reviewResponse(
                scope, request.runId(), request.commitSha(),
                request.baseRef(), request.headRef(), scope.label(), root,
                reason, List.of(), clock.instant()
        );
    }

    private GitReviewChangesResponse reviewResponse(
            ReviewScope scope,
            String runId,
            String commitSha,
            String baseRef,
            String headRef,
            String label,
            String repositoryRoot,
            String reason,
            List<ConversationFileChangeResponse> files,
            Instant capturedAt
    ) {
        int additions = files.stream().mapToInt(
                ConversationFileChangeResponse::additions
        ).sum();
        int deletions = files.stream().mapToInt(
                ConversationFileChangeResponse::deletions
        ).sum();
        return new GitReviewChangesResponse(
                scope.name(), nullIfBlank(runId), nullIfBlank(commitSha),
                nullIfBlank(baseRef), nullIfBlank(headRef), label,
                empty(repositoryRoot), empty(reason), additions, deletions,
                files, capturedAt == null ? clock.instant() : capturedAt
        );
    }

    private ResolvedWorkspace resolveTask(String taskId) {
        AgentTask task = taskService.getTask(taskId);
        Path taskPath = requiredDirectory(task.getWorkspacePath());
        TaskWorktree lease = worktreeMapper.selectById(taskId);
        if (lease == null) {
            return new ResolvedWorkspace(
                    task, null, taskPath, taskPath,
                    TaskWorkspaceMode.LOCAL, false
            );
        }
        Path source = blank(lease.getSourceWorkspacePath())
                ? taskPath : requiredDirectory(lease.getSourceWorkspacePath());
        boolean retains = lease.getWorkspaceMode() == TaskWorkspaceMode.WORKTREE
                && lease.getWorktreeState().retainsWorkspace()
                && !blank(lease.getEffectiveWorkspacePath())
                && Files.isDirectory(Path.of(
                lease.getEffectiveWorkspacePath()
        ));
        Path effective = retains
                ? requiredDirectory(lease.getEffectiveWorkspacePath()) : source;
        return new ResolvedWorkspace(
                task, lease, source, effective, lease.getWorkspaceMode(),
                retains && !samePath(source, effective)
        );
    }

    private List<GitBranchSummaryResponse> branchResponses(
            List<Branch> branches,
            Path workspace
    ) {
        String unborn = git.head(workspace).isBlank()
                ? git.currentBranch(workspace) : "";
        List<GitBranchSummaryResponse> result = branches.stream()
                .map(item -> new GitBranchSummaryResponse(
                        item.name(), item.current(), item.remote(),
                        item.headSha(), item.upstream(), item.ahead(),
                        item.behind(), nullIfBlank(item.worktreePath())
                ))
                .collect(java.util.stream.Collectors.toCollection(
                        ArrayList::new
                ));
        if (!unborn.isBlank()
                && result.stream().noneMatch(item -> item.name().equals(unborn))) {
            result.addFirst(new GitBranchSummaryResponse(
                    unborn, true, false, "", "", 0, 0,
                    git.repositoryRoot(workspace).toString()
            ));
        }
        return List.copyOf(result);
    }

    private GitCommitSummaryResponse commitResponse(Commit commit) {
        return new GitCommitSummaryResponse(
                commit.sha(), commit.shortSha(), commit.summary(),
                commit.authorName(), instant(commit.authoredAt()),
                commit.parentShas(), commit.decorations()
        );
    }

    private WorkspaceGitStatusResponse statusResponse(Status status) {
        return new WorkspaceGitStatusResponse(
                status.clean(), status.staged(), status.unstaged(),
                status.untracked(), status.conflicted(),
                status.ahead(), status.behind()
        );
    }

    private void assertRevision(Path root, Long expectedRevision) {
        if (expectedRevision == null) return;
        long current = currentRevision(root);
        if (current != expectedRevision) {
            throw new IllegalStateException(
                    "工作区已发生变化，请刷新后重试"
            );
        }
    }

    private Path requireGitRoot(Path workspace) {
        if (!git.isRepository(workspace)) {
            throw new IllegalStateException("当前工作区不是 Git 仓库");
        }
        return git.repositoryRoot(workspace);
    }

    private Path requiredDirectory(String value) {
        if (blank(value)) throw new IllegalArgumentException("工作区路径不能为空");
        Path path;
        try {
            path = Path.of(value).toAbsolutePath().normalize();
        } catch (RuntimeException error) {
            throw new IllegalArgumentException("工作区路径不合法", error);
        }
        if (!Files.isDirectory(path)) {
            throw new IllegalStateException("工作区目录不存在");
        }
        return path;
    }

    private Path normalized(Path path) {
        return path.toAbsolutePath().normalize();
    }

    private boolean samePath(Path first, Path second) {
        return normalized(first).equals(normalized(second));
    }

    private long currentRevision(Path workspace) {
        Path key = git.isRepository(workspace)
                ? git.repositoryRoot(workspace) : workspace;
        return workspaceLedger.currentRevision(key.toString());
    }

    private String branchName(String reference) {
        String prefix = "refs/heads/";
        return reference != null && reference.startsWith(prefix)
                ? reference.substring(prefix.length()) : "";
    }

    private String requireRef(String value, String field) {
        String result = empty(value);
        if (result.isBlank()) {
            throw new IllegalArgumentException(field + " 不能为空");
        }
        return result;
    }

    private Instant instant(String value) {
        try {
            return Instant.parse(value);
        } catch (DateTimeParseException ignored) {
            return null;
        }
    }

    private String shortSha(String value) {
        String sha = empty(value);
        return sha.substring(0, Math.min(7, sha.length()));
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private static String empty(String value) {
        return value == null ? "" : value.trim();
    }

    private static String nullIfBlank(String value) {
        return blank(value) ? null : value;
    }

    private record ResolvedWorkspace(
            AgentTask task,
            TaskWorktree lease,
            Path source,
            Path effective,
            TaskWorkspaceMode mode,
            boolean physicalWorktree
    ) {
    }

    private enum ReviewScope {
        LAST_RUN("本轮"),
        UNCOMMITTED("全部未提交"),
        UNSTAGED("未暂存"),
        STAGED("已暂存"),
        COMMIT("提交"),
        BRANCH_COMPARE("分支比较");

        private final String label;

        ReviewScope(String label) {
            this.label = label;
        }

        String label() {
            return label;
        }

        static ReviewScope parse(String value) {
            String normalized = empty(value).toUpperCase(Locale.ROOT);
            if ("RUN".equals(normalized)) normalized = "LAST_RUN";
            try {
                return ReviewScope.valueOf(normalized);
            } catch (IllegalArgumentException error) {
                throw new IllegalArgumentException("不支持的 Git 审阅范围");
            }
        }
    }
}
