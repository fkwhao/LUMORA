package com.lumora.core.conversation.application.support;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.lumora.core.conversation.api.dto.response.ConversationFileChangeResponse;
import com.lumora.core.conversation.api.dto.response.ConversationRunChangesResponse;
import com.lumora.core.conversation.domain.entity.ConversationRun;
import com.lumora.core.conversation.domain.entity.ConversationRunChangeSet;
import com.lumora.core.conversation.domain.model.RunChangeSetStatus;
import com.lumora.core.conversation.infrastructure.persistence.ConversationRunChangeSetMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

/**
 * Captures one Run's before/after workspace as Git trees without touching the
 * user's real index. The physical workspace is recorded separately from the
 * repository's primary worktree so captured trees remain readable after a
 * temporary task Worktree is removed.
 */
@Service
@RequiredArgsConstructor
public class GitRunChangeService {

    private static final int MAX_CHANGED_FILES = 500;
    private static final int MAX_PATCH_CHARS = 500_000;
    private static final long GIT_TIMEOUT_SECONDS = 60L;

    private final ConversationRunChangeSetMapper changeSetMapper;
    private final Clock clock;

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
            List<ConversationRunChangeSet> repositoryLeases =
                    workspaceLeases(workspaceRoot);
            if (!repositoryLeases.isEmpty()) {
                String reason = "同一物理工作区出现并发 Run，相关 Run 均不提供自动撤回";
                for (ConversationRunChangeSet lease : repositoryLeases) {
                    lease.setStatus(RunChangeSetStatus.COLLIDED);
                    lease.setReason(reason);
                    lease.setUpdatedAt(now);
                    changeSetMapper.updateById(lease);
                }
                changeSet.setStatus(RunChangeSetStatus.COLLIDED);
                changeSet.setReason(reason);
                changeSet.setUpdatedAt(now);
                changeSetMapper.insert(changeSet);
                return;
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
        if (changeSet.getStatus() == RunChangeSetStatus.COLLIDED) {
            changeSet.setStatus(RunChangeSetStatus.UNAVAILABLE);
            Instant capturedAt = clock.instant();
            changeSet.setCapturedAt(capturedAt);
            changeSet.setUpdatedAt(capturedAt);
            changeSetMapper.updateById(changeSet);
            return;
        }
        if (changeSet.getStatus() == RunChangeSetStatus.UNAVAILABLE) {
            if (changeSet.getCapturedAt() == null) {
                Instant capturedAt = clock.instant();
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

    public synchronized ConversationRunChangesResponse revert(
            String taskId,
            String runId
    ) {
        ConversationRunChangeSet changeSet = requireForTask(taskId, runId);
        if (changeSet.getStatus() == RunChangeSetStatus.REVERTED) {
            return changes(taskId, runId);
        }
        if (changeSet.getStatus() != RunChangeSetStatus.CAPTURED) {
            throw new IllegalStateException(
                    "当前 Run 没有可撤回的 Git 变更快照"
            );
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
        Instant now = clock.instant();
        changeSet.setStatus(RunChangeSetStatus.REVERTED);
        changeSet.setReason("");
        changeSet.setUpdatedAt(now);
        changeSet.setRevertedAt(now);
        changeSetMapper.updateById(changeSet);
        return changes(taskId, runId);
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

    private record GitResult(int exitCode, String output) {
        private String successOutput() {
            return exitCode == 0 ? output.trim() : "";
        }
    }
}
