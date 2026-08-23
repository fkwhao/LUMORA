package com.lumora.core.conversation.application.support;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.lumora.core.conversation.api.dto.response.ConversationFileChangeResponse;
import com.lumora.core.conversation.api.dto.response.ConversationRunChangesResponse;
import com.lumora.core.conversation.domain.entity.ConversationRun;
import com.lumora.core.conversation.domain.entity.ConversationRunChangeSet;
import com.lumora.core.conversation.domain.model.RunChangeSetStatus;
import com.lumora.core.conversation.infrastructure.persistence.ConversationRunChangeSetMapper;
import com.lumora.core.shared.infrastructure.git.GitWorkspaceMutationGate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.Base64;

/**
 * Captures one Run's before/after workspace as Git trees without touching the
 * user's real index. The physical workspace is recorded separately from the
 * repository's primary worktree so captured trees remain readable after a
 * temporary task Worktree is removed.
 */
@Service
public class GitRunChangeService {

    private static final int MAX_CHANGED_FILES = 500;
    private static final int MAX_PATCH_CHARS = 500_000;
    private static final long GIT_TIMEOUT_SECONDS = 60L;

    private final ConversationRunChangeSetMapper changeSetMapper;
    private final Clock clock;
    private final WorkspaceChangeLedgerService workspaceLedger;
    private final GitWorkspaceMutationGate mutationGate;

    @Autowired
    public GitRunChangeService(
            ConversationRunChangeSetMapper changeSetMapper,
            Clock clock,
            WorkspaceChangeLedgerService workspaceLedger,
            GitWorkspaceMutationGate mutationGate
    ) {
        this.changeSetMapper = changeSetMapper;
        this.clock = clock;
        this.workspaceLedger = workspaceLedger;
        this.mutationGate = mutationGate;
    }

    /** Test-compatible constructor with a durable ownership ledger. */
    public GitRunChangeService(
            ConversationRunChangeSetMapper changeSetMapper,
            Clock clock,
            WorkspaceChangeLedgerService workspaceLedger
    ) {
        this(
                changeSetMapper, clock, workspaceLedger,
                new GitWorkspaceMutationGate()
        );
    }

    /** Test-compatible constructor for snapshot-only fixtures. */
    public GitRunChangeService(
            ConversationRunChangeSetMapper changeSetMapper,
            Clock clock
    ) {
        this(
                changeSetMapper, clock, null,
                new GitWorkspaceMutationGate()
        );
    }

    public synchronized void begin(ConversationRun run) {
        if (changeSetMapper.selectById(run.getRunId()) != null) {
            return;
        }
        Instant now = clock.instant();
        ConversationRunChangeSet changeSet = newChangeSet(run, now);
        String workspace = valueOrEmpty(run.getWorkspacePath());
        if (workspace.isBlank()) {
            unavailable(changeSet, "当前任务没有工作区，无法建立 Git 变更基线");
            return;
        }
        try {
            Path workspacePath = Path.of(workspace).toAbsolutePath().normalize();
            if (!Files.isDirectory(workspacePath)) {
                unavailable(changeSet, "工作区不存在，无法建立 Git 变更基线");
                return;
            }
            Path workspaceRoot = workspaceRoot(workspacePath);
            Path repositoryRoot = repositoryRoot(workspaceRoot);
            changeSet.setRepositoryRoot(repositoryRoot.toString());
            changeSet.setWorkspacePath(workspaceRoot.toString());
            if (workspaceLedger != null) {
                workspaceLedger.beginRun(
                        run, repositoryRoot.toString(), workspaceRoot.toString()
                );
            }
            Snapshot snapshot = snapshot(workspaceRoot);
            changeSet.setBeforeTree(snapshot.tree());
            changeSet.setBeforeHead(snapshot.head());
            changeSet.setBeforeIndexTree(snapshot.indexTree());
            changeSet.setStatus(RunChangeSetStatus.TRACKING);
            changeSet.setReason("");
            changeSetMapper.insert(changeSet);
            keepTree(repositoryRoot, run.getRunId(), "before", snapshot.tree());
        } catch (RuntimeException error) {
            if (workspaceLedger != null
                    && !workspaceLedger.isAttributed(run.getRunId())) {
                workspaceLedger.beginRun(
                        run, "", Path.of(workspace).toAbsolutePath()
                                .normalize().toString()
                );
            }
            unavailable(changeSet, safeMessage(error));
        }
    }

    public synchronized void captureTerminal(ConversationRun run) {
        ConversationRunChangeSet changeSet = changeSetMapper.selectById(
                run.getRunId()
        );
        if (changeSet == null) {
            return;
        }
        if (workspaceLedger != null) {
            workspaceLedger.completeRun(run.getRunId());
        }
        if (changeSet.getStatus() == RunChangeSetStatus.UNAVAILABLE) {
            if (changeSet.getCapturedAt() == null) {
                Instant capturedAt = clock.instant();
                if (workspaceLedger != null
                        && workspaceLedger.isAttributed(run.getRunId())) {
                    changeSet.setStatus(RunChangeSetStatus.CAPTURED);
                    changeSet.setReason("");
                }
                changeSet.setCapturedAt(capturedAt);
                changeSet.setUpdatedAt(capturedAt);
                changeSetMapper.updateById(changeSet);
            }
            return;
        }
        if (changeSet.getStatus() != RunChangeSetStatus.TRACKING) return;
        try {
            Path workspace = Path.of(changeSet.getWorkspacePath());
            Path repository = Path.of(changeSet.getRepositoryRoot());
            Snapshot snapshot = snapshot(workspace);
            changeSet.setAfterTree(snapshot.tree());
            changeSet.setAfterHead(snapshot.head());
            changeSet.setAfterIndexTree(snapshot.indexTree());
            changeSet.setStatus(RunChangeSetStatus.CAPTURED);
            changeSet.setReason(metadataReason(changeSet));
            if (workspaceLedger != null
                    && workspaceLedger.isAttributed(run.getRunId())
                    && workspaceLedger.isComplete(run.getRunId())
                    && netWorkspaceChanges(run.getRunId()).isEmpty()
                    && gitCheckpointChanged(changeSet)) {
                changeSet.setStatus(RunChangeSetStatus.COLLIDED);
                changeSet.setReason(
                        "本轮没有已归属的文件事件，但 Git Checkpoint 已变化；"
                                + "以下 Diff 仅用于诊断未归属变化，自动撤回已禁用"
                );
            }
            Instant capturedAt = clock.instant();
            changeSet.setCapturedAt(capturedAt);
            changeSet.setUpdatedAt(capturedAt);
            changeSetMapper.updateById(changeSet);
            keepTree(repository, run.getRunId(), "after", snapshot.tree());
        } catch (RuntimeException error) {
            Instant capturedAt = clock.instant();
            changeSet.setStatus(RunChangeSetStatus.UNAVAILABLE);
            changeSet.setReason(safeMessage(error));
            changeSet.setCapturedAt(capturedAt);
            changeSet.setUpdatedAt(capturedAt);
            changeSetMapper.updateById(changeSet);
        }
    }

    public synchronized ConversationRunChangesResponse changes(
            String taskId,
            String runId
    ) {
        ConversationRunChangeSet changeSet = requireForTask(taskId, runId);
        List<NetWorkspaceChange> owned = netWorkspaceChanges(runId);
        boolean attributed = workspaceLedger != null
                && workspaceLedger.isAttributed(runId);
        if (attributed) {
            boolean complete = workspaceLedger.isComplete(runId);
            Map<NetWorkspaceChange, Boolean> interleaving =
                    new LinkedHashMap<>();
            for (NetWorkspaceChange change : owned) {
                interleaving.put(
                        change,
                        hasInterleavedForeignChange(runId, change)
                );
            }
            List<ConversationFileChangeResponse> files;
            if (owned.isEmpty()
                    && changeSet.getStatus() == RunChangeSetStatus.COLLIDED
                    && !valueOrEmpty(changeSet.getBeforeTree()).isBlank()
                    && !valueOrEmpty(changeSet.getAfterTree()).isBlank()) {
                files = diff(
                        Path.of(changeSet.getRepositoryRoot()),
                        changeSet.getBeforeTree(), changeSet.getAfterTree()
                );
            } else {
                files = owned.stream()
                        .map(change -> ownedResponse(
                                changeSet, change,
                                Boolean.TRUE.equals(interleaving.get(change))
                        ))
                        .toList();
            }
            boolean zeroEffectProven = !owned.isEmpty()
                    || attributedZeroEffectProven(changeSet);
            boolean revertible = changeSet.getStatus()
                    == RunChangeSetStatus.CAPTURED
                    && complete
                    && zeroEffectProven
                    && metadataReason(changeSet).isBlank()
                    && owned.stream().allMatch(NetWorkspaceChange::revertible)
                    && owned.stream().noneMatch(change ->
                    hasLaterForeignChange(changeSet.getRunId(), change))
                    && Files.isDirectory(Path.of(changeSet.getWorkspacePath()));
            String attributionReason = "";
            if (interleaving.containsValue(true)) {
                attributionReason = "同一路径存在其他 Run 的交错修改；"
                        + "这里只展示本轮直接发布的变更片段，自动撤回已禁用";
            } else if (!zeroEffectProven) {
                attributionReason = "本轮没有已归属的文件事件，"
                        + "也缺少可验证的零副作用凭据；自动撤回已禁用";
            }
            return response(
                    changeSet, files, revertible, attributionReason
            );
        }
        if (changeSet.getStatus() == RunChangeSetStatus.UNAVAILABLE) {
            return response(changeSet, List.of(), false);
        }
        String comparisonTree = changeSet.getAfterTree();
        if (changeSet.getStatus() == RunChangeSetStatus.TRACKING) {
            comparisonTree = snapshot(Path.of(
                    changeSet.getWorkspacePath()
            )).tree();
        }
        if (comparisonTree == null || comparisonTree.isBlank()) {
            return response(changeSet, List.of(), false);
        }
        List<ConversationFileChangeResponse> files = diff(
                Path.of(changeSet.getRepositoryRoot()),
                changeSet.getBeforeTree(),
                comparisonTree
        );
        boolean revertible = changeSet.getStatus()
                == RunChangeSetStatus.CAPTURED
                && metadataReason(changeSet).isBlank()
                && Files.isDirectory(Path.of(changeSet.getWorkspacePath()));
        return response(changeSet, files, revertible);
    }

    /**
     * Reads an immutable Git tree range without requiring a Run change-set.
     * Task-level Worktree review uses this to expose the complete isolated
     * result while Run review continues to use its own before/after trees.
     */
    public synchronized List<ConversationFileChangeResponse> diffTrees(
            String repositoryRoot,
            String beforeTree,
            String afterTree
    ) {
        if (valueOrEmpty(repositoryRoot).isBlank()
                || valueOrEmpty(beforeTree).isBlank()
                || valueOrEmpty(afterTree).isBlank()) {
            return List.of();
        }
        return diff(
                Path.of(repositoryRoot).toAbsolutePath().normalize(),
                beforeTree.trim(), afterTree.trim()
        );
    }

    public ConversationRunChangesResponse revert(
            String taskId,
            String runId
    ) {
        return mutationGate.execute(() -> revertLocked(taskId, runId));
    }

    private synchronized ConversationRunChangesResponse revertLocked(
            String taskId,
            String runId
    ) {
        ConversationRunChangeSet changeSet = requireForTask(taskId, runId);
        if (changeSet.getStatus() == RunChangeSetStatus.REVERTED) {
            return changes(taskId, runId);
        }
        if (changeSet.getStatus() == RunChangeSetStatus.COLLIDED
                && !valueOrEmpty(changeSet.getReason()).isBlank()) {
            throw new IllegalStateException(changeSet.getReason());
        }
        if (changeSet.getStatus() != RunChangeSetStatus.CAPTURED) {
            throw new IllegalStateException(
                    "当前 Run 没有可撤回的 Git 变更快照"
            );
        }
        List<NetWorkspaceChange> owned = netWorkspaceChanges(runId);
        boolean attributed = workspaceLedger != null
                && workspaceLedger.isAttributed(runId);
        if (attributed) {
            String incompleteReason = workspaceLedger.incompleteReason(runId);
            if (!incompleteReason.isBlank()) {
                throw new IllegalStateException(incompleteReason);
            }
            String reason = metadataReason(changeSet);
            if (!reason.isBlank()) {
                throw new IllegalStateException(reason);
            }
            if (owned.isEmpty()) {
                if (!attributedZeroEffectProven(changeSet)) {
                    throw new IllegalStateException(
                            "本轮没有已归属的文件事件，也缺少可验证的零副作用凭据；"
                                    + "为避免遗漏文件，已拒绝撤回"
                    );
                }
                markReverted(changeSet);
                return changes(taskId, runId);
            }
            revertOwnedChanges(changeSet, owned);
            advanceRevision(Path.of(changeSet.getWorkspacePath()));
            markReverted(changeSet);
            return changes(taskId, runId);
        }
        String metadataReason = metadataReason(changeSet);
        if (!metadataReason.isBlank()) {
            throw new IllegalStateException(metadataReason);
        }
        Path root = Path.of(changeSet.getWorkspacePath());
        if (!Files.isDirectory(root)) {
            throw new IllegalStateException("本轮使用的临时 Worktree 已清理，不能原地撤回");
        }
        if (!workspaceLeases(root).isEmpty()) {
            throw new IllegalStateException(
                    "同一物理工作区仍有其他活动 Run，不能撤回"
            );
        }
        Snapshot current = snapshot(root);
        if (!current.tree().equals(changeSet.getAfterTree())
                || !current.head().equals(changeSet.getAfterHead())
                || !current.indexTree().equals(
                changeSet.getAfterIndexTree())) {
            throw new IllegalStateException(
                    "工作区在本轮结束后又发生了变化；为避免覆盖后续修改，已拒绝自动撤回"
            );
        }
        restore(root, changeSet.getBeforeTree(), changeSet.getAfterTree());
        Snapshot restored = snapshot(root);
        if (!restored.tree().equals(changeSet.getBeforeTree())) {
            throw new IllegalStateException("Git 工作区未能完整恢复到本轮执行前");
        }
        advanceRevision(root);
        markReverted(changeSet);
        return changes(taskId, runId);
    }

    private void advanceRevision(Path workspace) {
        if (workspaceLedger != null) {
            workspaceLedger.advanceRevision(workspace.toString());
        }
    }

    private boolean attributedZeroEffectProven(
            ConversationRunChangeSet changeSet
    ) {
        // The Git tree does not include ignored files, and non-Git workspaces
        // have no immutable checkpoint. Until a durable explicit zero-effect
        // event exists, an empty ledger cannot prove that a Run changed no file.
        return false;
    }

    private boolean gitCheckpointChanged(
            ConversationRunChangeSet changeSet
    ) {
        return !valueOrEmpty(changeSet.getBeforeTree()).equals(
                valueOrEmpty(changeSet.getAfterTree())
        ) || !valueOrEmpty(changeSet.getBeforeHead()).equals(
                valueOrEmpty(changeSet.getAfterHead())
        ) || !valueOrEmpty(changeSet.getBeforeIndexTree()).equals(
                valueOrEmpty(changeSet.getAfterIndexTree())
        );
    }

    private List<NetWorkspaceChange> netWorkspaceChanges(String runId) {
        if (workspaceLedger == null) return List.of();
        List<WorkspaceChangeLedgerService.OwnedWorkspaceChange> events =
                workspaceLedger.changesForRun(runId);
        if (events.isEmpty()) return List.of();
        Map<String, NetWorkspaceChange> changes = new LinkedHashMap<>();
        for (WorkspaceChangeLedgerService.OwnedWorkspaceChange event : events) {
            boolean rename = "RENAMED".equals(event.operation())
                    && !valueOrEmpty(event.previousPath()).isBlank();
            String lookupPath = rename ? event.previousPath() : event.path();
            NetWorkspaceChange existing = changes.remove(lookupPath);
            if (existing == null) {
                Set<String> aliases = new LinkedHashSet<>();
                aliases.add(event.path());
                if (!valueOrEmpty(event.previousPath()).isBlank()) {
                    aliases.add(event.previousPath());
                }
                existing = new NetWorkspaceChange(
                        event.workspaceKey(), event.repositoryRoot(),
                        event.workspacePath(), event.path(),
                        rename ? event.previousPath() : event.path(),
                        event.previousPath(),
                        event.beforeHash(), event.afterHash(),
                        event.beforeBlob(), event.afterBlob(),
                        event.beforeContent(), event.afterContent(),
                        event.patch(), event.patchTruncated(), event.binary(),
                        event.additions(), event.deletions(),
                        event.operation(), event.operation(),
                        event.revision(), event.revision(),
                        Set.copyOf(aliases)
                );
            } else {
                Set<String> aliases = new LinkedHashSet<>(existing.aliases());
                aliases.add(event.path());
                if (!valueOrEmpty(event.previousPath()).isBlank()) {
                    aliases.add(event.previousPath());
                }
                existing = new NetWorkspaceChange(
                        existing.workspaceKey(), existing.repositoryRoot(),
                        existing.workspacePath(), event.path(),
                        existing.originalPath(), existing.displayPreviousPath(),
                        existing.beforeHash(),
                        event.afterHash(), existing.beforeBlob(),
                        event.afterBlob(), existing.beforeContent(),
                        event.afterContent(),
                        existing.fallbackPatch() + event.patch(),
                        existing.patchTruncated() || event.patchTruncated(),
                        existing.binary() || event.binary(),
                        existing.fallbackAdditions() + event.additions(),
                        existing.fallbackDeletions() + event.deletions(),
                        existing.originOperation(), event.operation(),
                        existing.firstRevision(), event.revision(),
                        Set.copyOf(aliases)
                );
            }
            changes.put(existing.path(), existing);
        }
        return changes.values().stream()
                .filter(change -> !valueOrEmpty(change.beforeBlob()).equals(
                        valueOrEmpty(change.afterBlob())
                ) || !valueOrEmpty(change.beforeHash()).equals(
                        valueOrEmpty(change.afterHash())
                ) || !change.originalPath().equals(change.path()))
                .toList();
    }

    private ConversationFileChangeResponse ownedResponse(
            ConversationRunChangeSet changeSet,
            NetWorkspaceChange change,
            boolean interleaved
    ) {
        String status = ownedStatus(change);
        if (interleaved) {
            return new ConversationFileChangeResponse(
                    change.path(),
                    displayPreviousPath(change, status),
                    status, change.fallbackAdditions(),
                    change.fallbackDeletions(), change.binary(),
                    ownedOnlyPatch(change.fallbackPatch()), true
            );
        }
        if (!change.beforeBlob().isBlank() || !change.afterBlob().isBlank()) {
            BlobDiff result = blobDiff(
                    Path.of(changeSet.getRepositoryRoot()),
                    change.beforeBlob(), change.afterBlob()
            );
            return new ConversationFileChangeResponse(
                    change.path(),
                    displayPreviousPath(change, status),
                    status, result.additions(), result.deletions(),
                    result.binary(), result.patch(), result.truncated()
            );
        }
        if (!change.patchTruncated()) {
            BlobDiff result = contentDiff(
                    change.beforeContent(), change.afterContent()
            );
            return new ConversationFileChangeResponse(
                    change.path(),
                    displayPreviousPath(change, status),
                    status, result.additions(), result.deletions(),
                    result.binary(), result.patch(), result.truncated()
            );
        }
        return new ConversationFileChangeResponse(
                change.path(),
                displayPreviousPath(change, status),
                status, change.fallbackAdditions(),
                change.fallbackDeletions(), change.binary(),
                change.fallbackPatch(), true
        );
    }

    private String ownedStatus(NetWorkspaceChange change) {
        if (!change.originalPath().equals(change.path())) return "RENAMED";
        if ("COPIED".equals(change.originOperation())
                && !change.displayPreviousPath().isBlank()) return "COPIED";
        if (change.beforeBlob().isBlank() && change.beforeHash().isBlank()) {
            return "ADDED";
        }
        if (change.afterBlob().isBlank() && change.afterHash().isBlank()) {
            return "DELETED";
        }
        return "MODIFIED";
    }

    private String displayPreviousPath(
            NetWorkspaceChange change,
            String status
    ) {
        if ("RENAMED".equals(status)) return change.originalPath();
        if ("COPIED".equals(status)) return change.displayPreviousPath();
        return "";
    }

    private void revertOwnedChanges(
            ConversationRunChangeSet changeSet,
            List<NetWorkspaceChange> changes
    ) {
        Path root = Path.of(changeSet.getWorkspacePath())
                .toAbsolutePath().normalize();
        if (!Files.isDirectory(root)) {
            throw new IllegalStateException("本轮工作区已不存在，不能撤回");
        }
        if (!workspaceLeases(root).isEmpty()) {
            throw new IllegalStateException("同一工作区仍有活动 Run，不能撤回");
        }
        for (NetWorkspaceChange change : changes) {
            if (!change.revertible()) {
                throw new IllegalStateException(
                        "本轮包含缺少 Git blob 的变更，无法安全撤回: "
                                + change.path()
                );
            }
            if (hasLaterForeignChange(changeSet.getRunId(), change)) {
                throw new IllegalStateException(
                        "其他运行已在本轮之后修改或依赖该路径，已拒绝撤回: "
                                + change.path()
                );
            }
            String current = change.usesGitBlobs()
                    ? currentBlob(root, change.path())
                    : currentHash(root, change.path());
            String expected = change.usesGitBlobs()
                    ? valueOrEmpty(change.afterBlob())
                    : valueOrEmpty(change.afterHash());
            if (!current.equals(expected)) {
                throw new IllegalStateException(
                        "文件在本轮结束后又发生了变化，已拒绝撤回: "
                                + change.path()
                );
            }
            if (!change.originalPath().equals(change.path())
                    && Files.exists(root.resolve(change.originalPath()),
                    LinkOption.NOFOLLOW_LINKS)) {
                throw new IllegalStateException(
                        "重命名前的路径已被重新占用，已拒绝撤回: "
                                + change.originalPath()
                );
            }
        }
        List<NetWorkspaceChange> ordered = changes.stream()
                .sorted((left, right) -> Long.compare(
                        right.lastRevision(), left.lastRevision()
                )).toList();
        List<NetWorkspaceChange> restored = new ArrayList<>();
        try {
            for (NetWorkspaceChange change : ordered) {
                restoreOwned(root, change);
                restored.add(change);
            }
        } catch (RuntimeException failure) {
            for (int index = restored.size() - 1; index >= 0; index -= 1) {
                try {
                    restoreAfter(root, restored.get(index));
                } catch (RuntimeException rollbackFailure) {
                    failure.addSuppressed(rollbackFailure);
                }
            }
            throw new IllegalStateException(
                    "撤回未能完整完成，已尝试恢复撤回前状态", failure
            );
        }
    }

    private boolean hasLaterForeignChange(
            String runId,
            NetWorkspaceChange change
    ) {
        return change.aliases().stream().anyMatch(path ->
                workspaceLedger.hasLaterForeignChange(
                        change.workspaceKey(), runId,
                        path, change.firstRevision()
                )
        );
    }

    private boolean hasInterleavedForeignChange(
            String runId,
            NetWorkspaceChange change
    ) {
        return change.aliases().stream().anyMatch(path ->
                workspaceLedger.hasForeignChangeBetween(
                        change.workspaceKey(), runId, path,
                        change.firstRevision(), change.lastRevision()
                )
        );
    }

    private String ownedOnlyPatch(String patch) {
        StringBuilder result = new StringBuilder();
        for (String line : valueOrEmpty(patch).split("\\R", -1)) {
            boolean header = line.startsWith("diff --git ")
                    || line.startsWith("--- ")
                    || line.startsWith("+++ ")
                    || line.startsWith("@@");
            boolean changed = line.startsWith("+")
                    && !line.startsWith("+++ ")
                    || line.startsWith("-")
                    && !line.startsWith("--- ");
            if (header || changed) {
                if (!result.isEmpty()) result.append('\n');
                result.append(line);
            }
        }
        return result.toString();
    }

    private void restoreOwned(Path root, NetWorkspaceChange change) {
        Path target = safeWorkspacePath(root, change.path());
        Path original = safeWorkspacePath(root, change.originalPath());
        try {
            if (!change.originalPath().equals(change.path())) {
                Files.deleteIfExists(target);
                removeEmptyParents(target.getParent(), root);
            }
            if (change.beforeHash().isBlank()) {
                Files.deleteIfExists(original);
                removeEmptyParents(original.getParent(), root);
                return;
            }
            if (change.usesGitBlobs()) {
                writeBlobAtomically(root, original, change.beforeBlob());
            } else {
                writeContentAtomically(original, change.beforeContent());
            }
        } catch (IOException error) {
            throw new IllegalStateException(
                    "无法撤回文件变更: " + change.path(), error
            );
        }
    }

    private void restoreAfter(Path root, NetWorkspaceChange change) {
        Path target = safeWorkspacePath(root, change.path());
        Path original = safeWorkspacePath(root, change.originalPath());
        try {
            if (!change.originalPath().equals(change.path())) {
                Files.deleteIfExists(original);
                removeEmptyParents(original.getParent(), root);
            }
            if (change.afterHash().isBlank()) {
                Files.deleteIfExists(target);
                removeEmptyParents(target.getParent(), root);
            } else if (change.usesGitBlobs()) {
                writeBlobAtomically(root, target, change.afterBlob());
            } else {
                writeContentAtomically(target, change.afterContent());
            }
        } catch (IOException error) {
            throw new IllegalStateException(
                    "无法恢复撤回前状态: " + change.path(), error
            );
        }
    }

    private void writeBlobAtomically(Path root, Path target, String blob)
            throws IOException {
        writeBytesAtomically(target, readBlob(root, blob));
    }

    private void writeContentAtomically(Path target, String content)
            throws IOException {
        writeBytesAtomically(
                target,
                Base64.getDecoder().decode(valueOrEmpty(content))
        );
    }

    private void writeBytesAtomically(Path target, byte[] content)
            throws IOException {
        Files.createDirectories(target.getParent());
        Path temporary = Files.createTempFile(
                target.getParent(), ".lumora-revert-", ".tmp"
        );
        try {
            Files.write(temporary, content);
            try {
                Files.move(temporary, target,
                        StandardCopyOption.ATOMIC_MOVE,
                        StandardCopyOption.REPLACE_EXISTING);
            } catch (java.nio.file.AtomicMoveNotSupportedException ignored) {
                Files.move(temporary, target,
                        StandardCopyOption.REPLACE_EXISTING);
            }
        } finally {
            Files.deleteIfExists(temporary);
        }
    }

    private Path safeWorkspacePath(Path root, String relativePath) {
        Path result = root.resolve(relativePath).normalize();
        if (!result.startsWith(root) || result.startsWith(root.resolve(".git"))) {
            throw new IllegalStateException("变更路径超出工作区: " + relativePath);
        }
        return result;
    }

    private void markReverted(ConversationRunChangeSet changeSet) {
        Instant now = clock.instant();
        changeSet.setStatus(RunChangeSetStatus.REVERTED);
        changeSet.setReason("");
        changeSet.setUpdatedAt(now);
        changeSet.setRevertedAt(now);
        changeSetMapper.updateById(changeSet);
    }

    private ConversationRunChangeSet requireForTask(
            String taskId,
            String runId
    ) {
        ConversationRunChangeSet changeSet = changeSetMapper.selectById(runId);
        if (changeSet == null || !changeSet.getTaskId().equals(taskId)) {
            throw new IllegalArgumentException("运行变更记录不存在");
        }
        return changeSet;
    }

    private ConversationRunChangeSet newChangeSet(
            ConversationRun run,
            Instant now
    ) {
        ConversationRunChangeSet result = new ConversationRunChangeSet();
        result.setRunId(run.getRunId());
        result.setTaskId(run.getTaskId());
        result.setRepositoryRoot("");
        result.setWorkspacePath(valueOrEmpty(run.getWorkspacePath()));
        result.setBeforeTree("");
        result.setAfterTree("");
        result.setBeforeHead("");
        result.setAfterHead("");
        result.setBeforeIndexTree("");
        result.setAfterIndexTree("");
        result.setStatus(RunChangeSetStatus.UNAVAILABLE);
        result.setReason("");
        result.setCreatedAt(now);
        result.setUpdatedAt(now);
        return result;
    }

    private void unavailable(
            ConversationRunChangeSet changeSet,
            String reason
    ) {
        changeSet.setStatus(RunChangeSetStatus.UNAVAILABLE);
        changeSet.setReason(reason == null || reason.isBlank()
                ? "Git 变更追踪不可用" : reason);
        changeSet.setUpdatedAt(clock.instant());
        if (changeSetMapper.selectById(changeSet.getRunId()) == null) {
            changeSetMapper.insert(changeSet);
        } else {
            changeSetMapper.updateById(changeSet);
        }
    }

    private List<ConversationRunChangeSet> workspaceLeases(
            Path workspacePath
    ) {
        return changeSetMapper.selectList(
                Wrappers.<ConversationRunChangeSet>lambdaQuery()
                        .in(ConversationRunChangeSet::getStatus,
                                RunChangeSetStatus.TRACKING,
                                RunChangeSetStatus.COLLIDED,
                                RunChangeSetStatus.UNAVAILABLE)
        ).stream().filter(item -> item.getCapturedAt() == null)
                .filter(item -> !valueOrEmpty(item.getWorkspacePath()).isBlank())
                .filter(item -> Path.of(item.getWorkspacePath())
                .toAbsolutePath().normalize().equals(
                        workspacePath.toAbsolutePath().normalize()
                )).toList();
    }

    private Path workspaceRoot(Path workspacePath) {
        GitResult result = git(workspacePath, Map.of(), false,
                "rev-parse", "--show-toplevel");
        if (result.exitCode() != 0 || result.output().isBlank()) {
            throw new IllegalStateException("当前工作区不是 Git 仓库");
        }
        Path root = Path.of(result.output().trim())
                .toAbsolutePath().normalize();
        if (!Files.isDirectory(root.resolve(".git"))
                && !Files.isRegularFile(root.resolve(".git"))) {
            throw new IllegalStateException("无法定位 Git 仓库元数据");
        }
        return root;
    }

    private Path repositoryRoot(Path workspaceRoot) {
        String output = requireGit(
                workspaceRoot, Map.of(), "worktree", "list", "--porcelain"
        );
        for (String line : output.split("\\R")) {
            if (!line.startsWith("worktree ")) continue;
            Path root = Path.of(line.substring("worktree ".length()).trim())
                    .toAbsolutePath().normalize();
            if (Files.isDirectory(root)) return root;
        }
        throw new IllegalStateException("无法定位 Git 主工作树");
    }

    private Snapshot snapshot(Path root) {
        String head = valueOrEmpty(git(root, Map.of(), false,
                "rev-parse", "--verify", "HEAD").successOutput());
        String indexTree = requireGit(
                root, Map.of(), "write-tree"
        ).trim();
        Path temporaryIndex;
        try {
            temporaryIndex = Files.createTempFile(
                    "lumora-git-index-", ".tmp"
            );
            Files.deleteIfExists(temporaryIndex);
        } catch (IOException error) {
            throw new IllegalStateException("无法创建临时 Git index", error);
        }
        Map<String, String> environment = Map.of(
                "GIT_INDEX_FILE", temporaryIndex.toString(),
                "GIT_WORK_TREE", root.toString()
        );
        try {
            // Seed from the real index tree instead of HEAD. This preserves
            // staged paths (including force-added ignored files) while all
            // subsequent writes still happen only in the temporary index.
            requireGit(root, environment, "read-tree", indexTree);
            requireGit(root, environment, "add", "-A", "--", ".");
            String tree = requireGit(root, environment, "write-tree").trim();
            if (tree.isBlank()) {
                throw new IllegalStateException("Git 未返回工作区 tree");
            }
            return new Snapshot(tree, head, indexTree);
        } finally {
            try {
                Files.deleteIfExists(temporaryIndex);
            } catch (IOException ignored) {
                // Temporary indexes are outside the repository and disposable.
            }
        }
    }

    private void keepTree(
            Path root,
            String runId,
            String side,
            String tree
    ) {
        String safeRunId = runId.replaceAll("[^A-Za-z0-9._-]", "-");
        requireGit(root, Map.of(), "update-ref",
                "refs/lumora/runs/" + safeRunId + "/" + side, tree);
    }

    private List<ConversationFileChangeResponse> diff(
            Path root,
            String beforeTree,
            String afterTree
    ) {
        if (beforeTree.equals(afterTree)) {
            return List.of();
        }
        String output = requireGit(
                root, Map.of(), "diff", "--name-status", "-z", "--find-renames",
                beforeTree, afterTree, "--"
        );
        List<ChangedPath> paths = parseChangedPaths(output);
        if (paths.size() > MAX_CHANGED_FILES) {
            paths = paths.subList(0, MAX_CHANGED_FILES);
        }
        List<ConversationFileChangeResponse> result = new ArrayList<>();
        for (ChangedPath path : paths) {
            List<String> pathspecs = path.previousPath().isBlank()
                    ? List.of(path.path())
                    : List.of(path.previousPath(), path.path());
            List<String> numstatArguments = new ArrayList<>(List.of(
                    "diff", "--numstat", "-z", "--find-renames",
                    beforeTree, afterTree, "--"
            ));
            numstatArguments.addAll(pathspecs);
            String numstat = requireGit(
                    root, Map.of(), numstatArguments.toArray(String[]::new)
            );
            Counts counts = parseCounts(numstat);
            List<String> patchArguments = new ArrayList<>(List.of(
                    "diff", "--no-ext-diff", "--no-color", "--unified=3",
                    "--find-renames", beforeTree, afterTree, "--"
            ));
            patchArguments.addAll(pathspecs);
            String patch = counts.binary() ? "" : requireGit(
                    root, Map.of(), patchArguments.toArray(String[]::new)
            );
            boolean truncated = patch.length() > MAX_PATCH_CHARS;
            if (truncated) {
                patch = patch.substring(0, MAX_PATCH_CHARS);
            }
            result.add(new ConversationFileChangeResponse(
                    path.path(), path.previousPath(), path.status(),
                    counts.additions(), counts.deletions(), counts.binary(),
                    patch, truncated
            ));
        }
        return List.copyOf(result);
    }

    private List<ChangedPath> parseChangedPaths(String output) {
        List<ChangedPath> result = new ArrayList<>();
        if (output.indexOf('\0') >= 0) {
            List<String> fields = nulFields(output);
            int index = 0;
            while (index < fields.size() && !fields.get(index).isBlank()) {
                String rawStatus = fields.get(index++);
                if (index >= fields.size()) break;
                String firstPath = fields.get(index++);
                if ((rawStatus.startsWith("R")
                        || rawStatus.startsWith("C"))
                        && index < fields.size()) {
                    result.add(new ChangedPath(
                            fields.get(index++), firstPath,
                            changeStatus(rawStatus)
                    ));
                } else {
                    result.add(new ChangedPath(
                            firstPath, "", changeStatus(rawStatus)
                    ));
                }
            }
            return result;
        }
        for (String line : output.split("\\R")) {
            if (line.isBlank()) continue;
            String[] fields = line.split("\\t");
            if (fields.length < 2) continue;
            String rawStatus = fields[0];
            String status = changeStatus(rawStatus);
            if ((rawStatus.startsWith("R") || rawStatus.startsWith("C"))
                    && fields.length >= 3) {
                result.add(new ChangedPath(fields[2], fields[1], status));
            } else {
                result.add(new ChangedPath(fields[1], "", status));
            }
        }
        return result;
    }

    private List<String> nulFields(String output) {
        List<String> fields = new ArrayList<>();
        int start = 0;
        for (int index = 0; index < output.length(); index += 1) {
            if (output.charAt(index) == '\0') {
                fields.add(output.substring(start, index));
                start = index + 1;
            }
        }
        if (start < output.length()) fields.add(output.substring(start));
        return fields;
    }

    private String changeStatus(String rawStatus) {
        return switch (rawStatus.charAt(0)) {
            case 'A' -> "ADDED";
            case 'D' -> "DELETED";
            case 'R' -> "RENAMED";
            case 'C' -> "COPIED";
            default -> "MODIFIED";
        };
    }

    private Counts parseCounts(String output) {
        int additions = 0;
        int deletions = 0;
        boolean binary = false;
        List<String> records = output.indexOf('\0') >= 0
                ? nulFields(output) : List.of(output.split("\\R"));
        for (String line : records) {
            if (line.isBlank()) continue;
            String[] fields = line.split("\\t", 3);
            if (fields.length < 2) continue;
            if ("-".equals(fields[0]) || "-".equals(fields[1])) {
                binary = true;
                continue;
            }
            additions += integer(fields[0]);
            deletions += integer(fields[1]);
        }
        return new Counts(additions, deletions, binary);
    }

    private BlobDiff blobDiff(
            Path root,
            String beforeBlob,
            String afterBlob
    ) {
        String before = valueOrEmpty(beforeBlob);
        String after = valueOrEmpty(afterBlob);
        if (before.isBlank()) before = emptyBlob(root);
        if (after.isBlank()) after = emptyBlob(root);
        if (before.equals(after)) {
            return new BlobDiff(0, 0, false, "", false);
        }
        Counts counts = parseCounts(requireGit(
                root, Map.of(), "diff", "--numstat", before, after
        ));
        String patch = counts.binary() ? "" : requireGit(
                root, Map.of(), "diff", "--no-ext-diff", "--no-color",
                "--unified=3", before, after
        );
        boolean truncated = patch.length() > MAX_PATCH_CHARS;
        if (truncated) patch = patch.substring(0, MAX_PATCH_CHARS);
        return new BlobDiff(
                counts.additions(), counts.deletions(), counts.binary(),
                patch, truncated
        );
    }

    private BlobDiff contentDiff(
            String beforeContent,
            String afterContent
    ) {
        Path directory;
        try {
            directory = Files.createTempDirectory("lumora-content-diff-");
        } catch (IOException error) {
            throw new IllegalStateException("无法创建内容 Diff 临时目录", error);
        }
        Path before = directory.resolve("before");
        Path after = directory.resolve("after");
        try {
            Files.write(before, Base64.getDecoder().decode(
                    valueOrEmpty(beforeContent)
            ));
            Files.write(after, Base64.getDecoder().decode(
                    valueOrEmpty(afterContent)
            ));
            GitResult numstatResult = git(directory, Map.of(), true,
                    "diff", "--no-index", "--numstat", "--",
                    before.toString(), after.toString());
            if (numstatResult.exitCode() != 0
                    && numstatResult.exitCode() != 1) {
                throw new IllegalStateException(numstatResult.output().trim());
            }
            Counts counts = parseCounts(numstatResult.output());
            GitResult patchResult = git(directory, Map.of(), true,
                    "diff", "--no-index", "--no-color", "--unified=3",
                    "--", before.toString(), after.toString());
            if (patchResult.exitCode() != 0 && patchResult.exitCode() != 1) {
                throw new IllegalStateException(patchResult.output().trim());
            }
            String patch = counts.binary() ? "" : patchResult.output();
            boolean truncated = patch.length() > MAX_PATCH_CHARS;
            if (truncated) patch = patch.substring(0, MAX_PATCH_CHARS);
            return new BlobDiff(
                    counts.additions(), counts.deletions(), counts.binary(),
                    patch, truncated
            );
        } catch (IOException | IllegalArgumentException error) {
            throw new IllegalStateException("无法计算非 Git 文件 Diff", error);
        } finally {
            try {
                Files.deleteIfExists(before);
                Files.deleteIfExists(after);
                Files.deleteIfExists(directory);
            } catch (IOException ignored) {
                // Disposable diff inputs.
            }
        }
    }

    private String emptyBlob(Path root) {
        return gitWithInput(root, List.of("hash-object", "-w", "--stdin"),
                new byte[0]).trim();
    }

    private String currentBlob(Path root, String relativePath) {
        Path path = safeWorkspacePath(root, relativePath);
        if (!Files.exists(path, LinkOption.NOFOLLOW_LINKS)) return "";
        if (!Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS)) {
            throw new IllegalStateException(
                    "变更路径不再是普通文件: " + relativePath
            );
        }
        return requireGit(root, Map.of(), "hash-object", "--",
                root.relativize(path).toString()).trim();
    }

    private String currentHash(Path root, String relativePath) {
        Path path = safeWorkspacePath(root, relativePath);
        if (!Files.exists(path, LinkOption.NOFOLLOW_LINKS)) return "";
        if (!Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS)) {
            throw new IllegalStateException(
                    "变更路径不再是普通文件: " + relativePath
            );
        }
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256")
                            .digest(Files.readAllBytes(path))
            );
        } catch (IOException | NoSuchAlgorithmException error) {
            throw new IllegalStateException(
                    "无法校验文件当前版本: " + relativePath, error
            );
        }
    }

    private byte[] readBlob(Path root, String blob) {
        List<String> command = new ArrayList<>(List.of(
                "git", "-C", root.toString(), "cat-file", "blob", blob
        ));
        try {
            Process process = new ProcessBuilder(command)
                    .redirectErrorStream(false).start();
            byte[] output = process.getInputStream().readAllBytes();
            byte[] error = process.getErrorStream().readAllBytes();
            if (!process.waitFor(GIT_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                throw new IllegalStateException("读取 Git blob 超时");
            }
            if (process.exitValue() != 0) {
                throw new IllegalStateException(new String(
                        error, StandardCharsets.UTF_8
                ).trim());
            }
            return output;
        } catch (IOException error) {
            throw new IllegalStateException("无法读取 Git blob", error);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("读取 Git blob 被中断", error);
        }
    }

    private String gitWithInput(
            Path root,
            List<String> arguments,
            byte[] input
    ) {
        List<String> command = new ArrayList<>(List.of(
                "git", "-C", root.toString()
        ));
        command.addAll(arguments);
        try {
            Process process = new ProcessBuilder(command)
                    .redirectErrorStream(true).start();
            process.getOutputStream().write(input);
            process.getOutputStream().close();
            byte[] output = process.getInputStream().readAllBytes();
            if (!process.waitFor(GIT_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                throw new IllegalStateException("Git 命令执行超时");
            }
            String text = new String(output, StandardCharsets.UTF_8);
            if (process.exitValue() != 0) {
                throw new IllegalStateException(text.trim());
            }
            return text;
        } catch (IOException error) {
            throw new IllegalStateException("Git 不可用", error);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Git 命令被中断", error);
        }
    }

    private void restore(Path root, String beforeTree, String afterTree) {
        List<ChangedPath> changes = parseChangedPaths(requireGit(
                root, Map.of(), "diff", "--name-status", "-z", "--find-renames",
                beforeTree, afterTree, "--"
        ));
        Path temporaryIndex;
        try {
            temporaryIndex = Files.createTempFile(
                    "lumora-git-restore-", ".tmp"
            );
            Files.deleteIfExists(temporaryIndex);
        } catch (IOException error) {
            throw new IllegalStateException("无法创建 Git 恢复 index", error);
        }
        Map<String, String> environment = Map.of(
                "GIT_INDEX_FILE", temporaryIndex.toString(),
                "GIT_WORK_TREE", root.toString()
        );
        try {
            assertDeletedPathsRemainAbsent(root, changes);
            for (ChangedPath change : changes) {
                if (!"ADDED".equals(change.status())
                        && !"RENAMED".equals(change.status())
                        && !"COPIED".equals(change.status())) {
                    continue;
                }
                Path target = root.resolve(change.path()).normalize();
                if (!target.startsWith(root)
                        || target.startsWith(root.resolve(".git"))) {
                    throw new IllegalStateException("Git 变更路径超出工作区");
                }
                try {
                    Files.deleteIfExists(target);
                    removeEmptyParents(target.getParent(), root);
                } catch (IOException error) {
                    throw new IllegalStateException(
                            "无法删除本轮新增文件: " + change.path(), error
                    );
                }
            }
            requireGit(root, environment, "read-tree", beforeTree);
            requireGit(root, environment, "checkout-index", "--all", "--force");
        } finally {
            try {
                Files.deleteIfExists(temporaryIndex);
            } catch (IOException ignored) {
                // Best-effort temporary file cleanup.
            }
        }
    }

    private void assertDeletedPathsRemainAbsent(
            Path root,
            List<ChangedPath> changes
    ) {
        for (ChangedPath change : changes) {
            String absentPath = "DELETED".equals(change.status())
                    ? change.path()
                    : "RENAMED".equals(change.status())
                    ? change.previousPath() : "";
            if (absentPath.isBlank()) continue;
            Path target = root.resolve(absentPath).normalize();
            if (!target.startsWith(root)
                    || target.startsWith(root.resolve(".git"))) {
                throw new IllegalStateException("Git 变更路径超出工作区");
            }
            if (Files.exists(target, LinkOption.NOFOLLOW_LINKS)) {
                throw new IllegalStateException(
                        "本轮删除的路径已被重新占用；为避免覆盖后续文件，已拒绝自动撤回: "
                                + absentPath
                );
            }
        }
    }

    private void removeEmptyParents(Path directory, Path root)
            throws IOException {
        Path current = directory;
        while (current != null && !current.equals(root)
                && current.startsWith(root)) {
            try (var entries = Files.list(current)) {
                if (entries.findAny().isPresent()) return;
            }
            Files.deleteIfExists(current);
            current = current.getParent();
        }
    }

    private ConversationRunChangesResponse response(
            ConversationRunChangeSet changeSet,
            List<ConversationFileChangeResponse> files,
            boolean revertible
    ) {
        return response(changeSet, files, revertible, "");
    }

    private ConversationRunChangesResponse response(
            ConversationRunChangeSet changeSet,
            List<ConversationFileChangeResponse> files,
            boolean revertible,
            String reasonOverride
    ) {
        int additions = files.stream().mapToInt(
                ConversationFileChangeResponse::additions
        ).sum();
        int deletions = files.stream().mapToInt(
                ConversationFileChangeResponse::deletions
        ).sum();
        String reason = changeSet.getReason();
        String dynamicReason = metadataReason(changeSet);
        if ((reason == null || reason.isBlank()) && !dynamicReason.isBlank()) {
            reason = dynamicReason;
        }
        if ((reason == null || reason.isBlank()) && workspaceLedger != null) {
            String incompleteReason = workspaceLedger.incompleteReason(
                    changeSet.getRunId()
            );
            if (!incompleteReason.isBlank()) reason = incompleteReason;
        }
        if ((reason == null || reason.isBlank())
                && reasonOverride != null
                && !reasonOverride.isBlank()) {
            reason = reasonOverride;
        }
        return new ConversationRunChangesResponse(
                changeSet.getRunId(), changeSet.getStatus().name(),
                changeSet.getRepositoryRoot(), valueOrEmpty(reason),
                additions, deletions, revertible, files,
                changeSet.getCapturedAt(),
                changeSet.getRevertedAt()
        );
    }

    private String metadataReason(ConversationRunChangeSet changeSet) {
        if (changeSet.getStatus() != RunChangeSetStatus.CAPTURED
                && changeSet.getAfterTree().isBlank()) {
            return "";
        }
        if (!valueOrEmpty(changeSet.getBeforeHead()).equals(
                valueOrEmpty(changeSet.getAfterHead()))) {
            return "本轮执行修改了 Git HEAD，自动撤回已禁用";
        }
        if (!valueOrEmpty(changeSet.getBeforeIndexTree()).equals(
                valueOrEmpty(changeSet.getAfterIndexTree()))) {
            return "本轮执行修改了 Git 暂存区，自动撤回已禁用";
        }
        return "";
    }

    private String requireGit(
            Path root,
            Map<String, String> environment,
            String... arguments
    ) {
        GitResult result = git(root, environment, true, arguments);
        if (result.exitCode() != 0) {
            throw new IllegalStateException(
                    result.output().isBlank()
                            ? "Git 命令执行失败"
                            : result.output().trim()
            );
        }
        return result.output();
    }

    private GitResult git(
            Path root,
            Map<String, String> environment,
            boolean failOnStart,
            String... arguments
    ) {
        List<String> command = new ArrayList<>();
        command.add("git");
        command.add("-c");
        command.add("core.quotepath=false");
        command.add("-c");
        command.add("core.autocrlf=false");
        command.add("-C");
        command.add(root.toString());
        command.addAll(Arrays.asList(arguments));
        ProcessBuilder builder = new ProcessBuilder(command)
                .redirectErrorStream(true);
        builder.environment().putAll(new HashMap<>(environment));
        try {
            Process process = builder.start();
            CompletableFuture<byte[]> output = CompletableFuture.supplyAsync(
                    () -> readAll(process)
            );
            if (!process.waitFor(GIT_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                throw new IllegalStateException("Git 命令执行超时");
            }
            return new GitResult(
                    process.exitValue(),
                    new String(output.join(), StandardCharsets.UTF_8)
            );
        } catch (IOException error) {
            if (!failOnStart) {
                return new GitResult(127, "Git 不可用");
            }
            throw new IllegalStateException("Git 不可用", error);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Git 命令被中断", error);
        }
    }

    private byte[] readAll(Process process) {
        try {
            return process.getInputStream().readAllBytes();
        } catch (IOException error) {
            throw new IllegalStateException("无法读取 Git 输出", error);
        }
    }

    private static int integer(String value) {
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }

    private static String safeMessage(Throwable error) {
        String message = error == null ? null : error.getMessage();
        return message == null || message.isBlank()
                ? "Git 变更追踪不可用" : message;
    }

    private static String valueOrEmpty(String value) {
        return value == null ? "" : value.trim();
    }

    private record Snapshot(String tree, String head, String indexTree) {
    }

    private record ChangedPath(
            String path,
            String previousPath,
            String status
    ) {
    }

    private record Counts(int additions, int deletions, boolean binary) {
    }

    private record BlobDiff(
            int additions,
            int deletions,
            boolean binary,
            String patch,
            boolean truncated
    ) {
    }

    private record NetWorkspaceChange(
            String workspaceKey,
            String repositoryRoot,
            String workspacePath,
            String path,
            String originalPath,
            String displayPreviousPath,
            String beforeHash,
            String afterHash,
            String beforeBlob,
            String afterBlob,
            String beforeContent,
            String afterContent,
            String fallbackPatch,
            boolean patchTruncated,
            boolean binary,
            int fallbackAdditions,
            int fallbackDeletions,
            String originOperation,
            String lastOperation,
            long firstRevision,
            long lastRevision,
            Set<String> aliases
    ) {
        private boolean revertible() {
            boolean contentAvailable = !patchTruncated;
            boolean beforeAvailable = beforeHash == null || beforeHash.isBlank()
                    || beforeBlob != null && !beforeBlob.isBlank()
                    || contentAvailable;
            boolean afterAvailable = afterHash == null || afterHash.isBlank()
                    || afterBlob != null && !afterBlob.isBlank()
                    || contentAvailable;
            return beforeAvailable && afterAvailable;
        }

        private boolean usesGitBlobs() {
            return !valueOrEmpty(beforeBlob).isBlank()
                    || !valueOrEmpty(afterBlob).isBlank();
        }
    }

    private record GitResult(int exitCode, String output) {
        private String successOutput() {
            return exitCode == 0 ? output.trim() : "";
        }
    }
}
