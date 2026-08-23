package com.lumora.core.shared.infrastructure.git;

import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

/**
 * Process boundary for Git workspace operations used by task isolation.
 * Every snapshot uses a temporary index unless a method explicitly manages a
 * Lumora-owned worktree index.
 */
@Service
public class GitWorkspaceOperations {

    private static final long GIT_TIMEOUT_SECONDS = 90L;
    /** Public pages allow 200 rows; one extra row is an internal look-ahead. */
    private static final int MAX_HISTORY_FETCH = 201;
    private static final Map<String, String> INTERNAL_IDENTITY = Map.of(
            "GIT_AUTHOR_NAME", "Lumora",
            "GIT_AUTHOR_EMAIL", "lumora@local.invalid",
            "GIT_COMMITTER_NAME", "Lumora",
            "GIT_COMMITTER_EMAIL", "lumora@local.invalid"
    );

    public Path repositoryRoot(Path workspace) {
        Result result = run(workspace, Map.of(), false,
                "rev-parse", "--show-toplevel");
        if (result.exitCode() != 0 || result.output().isBlank()) {
            throw new IllegalStateException("当前工作区不是 Git 仓库");
        }
        Path root = Path.of(result.output().trim())
                .toAbsolutePath().normalize();
        if (!Files.isDirectory(root)) {
            throw new IllegalStateException("Git 仓库根目录不存在");
        }
        return root;
    }

    public boolean isRepository(Path workspace) {
        return Files.isDirectory(workspace)
                && run(workspace, Map.of(), false,
                "rev-parse", "--is-inside-work-tree").exitCode() == 0;
    }

    public String head(Path workspace) {
        Result result = run(workspace, Map.of(), false,
                "rev-parse", "--verify", "HEAD");
        return result.exitCode() == 0 ? result.output().trim() : "";
    }

    public String currentBranch(Path workspace) {
        Result result = run(
                workspace, Map.of(), false,
                "symbolic-ref", "--quiet", "--short", "HEAD"
        );
        return result.exitCode() == 0 ? result.output().trim() : "";
    }

    /** Ignored, untracked files are outside tree snapshots and must be guarded. */
    public List<String> ignoredUntracked(Path workspace, int limit) {
        int boundedLimit = Math.max(1, Math.min(limit, 1_000));
        String output = require(
                workspace, Map.of(), "ls-files", "--others", "--ignored",
                "--exclude-standard", "-z"
        );
        List<String> result = new ArrayList<>();
        for (String path : output.split("\\u0000", -1)) {
            if (path.isBlank()) continue;
            result.add(path);
            if (result.size() >= boundedLimit) break;
        }
        return List.copyOf(result);
    }

    /**
     * Finds target-tree writes that would overwrite a currently ignored,
     * untracked physical file. Such files are absent from Git tree merges and
     * therefore require an explicit physical collision guard.
     */
    public List<String> untrackedOverwriteConflicts(
            Path workspace,
            String currentTree,
            String targetTree,
            int limit
    ) {
        int boundedLimit = Math.max(1, Math.min(limit, 1_000));
        if (currentTree.equals(targetTree)) return List.of();
        String output = require(
                workspace, Map.of(), "diff", "--name-status", "-z",
                "--find-renames", currentTree, targetTree, "--"
        );
        List<String> fields = nulFields(output);
        List<String> targets = new ArrayList<>();
        int index = 0;
        while (index < fields.size()) {
            String status = fields.get(index++);
            if (status.isBlank() || index >= fields.size()) break;
            String path = fields.get(index++);
            if ((status.startsWith("R") || status.startsWith("C"))
                    && index < fields.size()) {
                path = fields.get(index++);
            }
            if (!status.startsWith("D")) targets.add(path);
        }
        List<String> collisions = new ArrayList<>();
        Path root = workspace.toAbsolutePath().normalize();
        for (String path : targets) {
            Path physical = root.resolve(path).normalize();
            if (!physical.startsWith(root)
                    || !Files.exists(physical)
                    || run(root, Map.of(), false,
                    "check-ignore", "--quiet", "--no-index", "--", path
            ).exitCode() != 0) {
                continue;
            }
            String targetBlob = run(root, Map.of(), false,
                    "rev-parse", targetTree + ":" + path).output().trim();
            String physicalBlob = Files.isRegularFile(physical)
                    ? run(root, Map.of(), false,
                    "hash-object", "--no-filters", "--", path
            ).output().trim() : "";
            if (!targetBlob.equals(physicalBlob)) {
                collisions.add(path);
                if (collisions.size() >= boundedLimit) break;
            }
        }
        return List.copyOf(collisions);
    }

    /** Returns a stable, renderer-safe projection of the current Git state. */
    public Status status(Path workspace) {
        String output = require(
                workspace, Map.of(), "status", "--porcelain=v2", "--branch",
                "--untracked-files=all"
        );
        int staged = 0;
        int unstaged = 0;
        int untracked = 0;
        int conflicted = 0;
        int ahead = 0;
        int behind = 0;
        for (String line : output.split("\\R")) {
            if (line.startsWith("# branch.ab ")) {
                String[] fields = line.substring("# branch.ab ".length())
                        .trim().split("\\s+");
                for (String field : fields) {
                    if (field.startsWith("+")) ahead = integer(field.substring(1));
                    if (field.startsWith("-")) behind = integer(field.substring(1));
                }
                continue;
            }
            if (line.startsWith("? ")) {
                untracked += 1;
                continue;
            }
            if (line.startsWith("u ")) {
                conflicted += 1;
                continue;
            }
            if ((line.startsWith("1 ") || line.startsWith("2 "))
                    && line.length() >= 4) {
                char index = line.charAt(2);
                char worktree = line.charAt(3);
                if (index != '.') staged += 1;
                if (worktree != '.') unstaged += 1;
            }
        }
        return new Status(
                staged == 0 && unstaged == 0 && untracked == 0
                        && conflicted == 0,
                staged, unstaged, untracked, conflicted, ahead, behind
        );
    }

    /** Lists local and remote branches without exposing arbitrary Git syntax. */
    public List<Branch> branches(Path workspace) {
        String current = currentBranch(workspace);
        Map<String, String> checkedOut = new HashMap<>();
        for (Worktree item : worktrees(workspace)) {
            if (!item.branchReference().isBlank()) {
                checkedOut.put(item.branchReference(), item.path().toString());
            }
        }
        String output = require(
                workspace, Map.of(), "for-each-ref",
                "--format=%(refname)%1f%(objectname)%1f%(upstream:short)",
                "refs/heads", "refs/remotes"
        );
        List<Branch> result = new ArrayList<>();
        for (String line : output.split("\\R")) {
            if (line.isBlank()) continue;
            String[] fields = line.split("\\u001f", -1);
            if (fields.length < 2) continue;
            String reference = fields[0];
            boolean remote = reference.startsWith("refs/remotes/");
            String name = remote
                    ? reference.substring("refs/remotes/".length())
                    : reference.substring("refs/heads/".length());
            if (remote && name.endsWith("/HEAD")) continue;
            String upstream = fields.length >= 3 ? fields[2] : "";
            Counts counts = upstream.isBlank()
                    ? new Counts(0, 0)
                    : aheadBehind(workspace, reference, upstream);
            result.add(new Branch(
                    name, !remote && name.equals(current), remote,
                    fields[1], upstream, counts.left(), counts.right(),
                    checkedOut.getOrDefault(reference, "")
            ));
        }
        return List.copyOf(result);
    }

    public List<Commit> history(
            Path workspace,
            int limit,
            String cursor
    ) {
        if (head(workspace).isBlank()) return List.of();
        int boundedLimit = Math.max(1, Math.min(limit, MAX_HISTORY_FETCH));
        List<String> arguments = new ArrayList<>(List.of(
                "log", "--max-count=" + boundedLimit,
                "--date=iso-strict",
                "--format=%H%x1f%h%x1f%s%x1f%an%x1f%aI%x1f%P%x1f%D%x00"
        ));
        if (cursor != null && !cursor.isBlank()) {
            arguments.add("--skip=1");
            arguments.add(requireRevision(cursor));
        }
        String output = require(
                workspace, Map.of(), arguments.toArray(String[]::new)
        );
        return parseCommits(output);
    }

    public Commit commit(Path workspace, String revision) {
        String output = require(
                workspace, Map.of(), "log", "--max-count=1",
                "--date=iso-strict",
                "--format=%H%x1f%h%x1f%s%x1f%an%x1f%aI%x1f%P%x1f%D%x00",
                requireRevision(revision)
        );
        List<Commit> commits = parseCommits(output);
        if (commits.isEmpty()) {
            throw new IllegalArgumentException("提交不存在");
        }
        return commits.getFirst();
    }

    private List<Commit> parseCommits(String output) {
        List<Commit> result = new ArrayList<>();
        for (String record : output.split("\\u0000")) {
            // String.strip() also removes U+001F, our field separator, when
            // decorations are empty. Remove only Git's record newlines.
            String normalized = record
                    .replaceFirst("^[\\r\\n]+", "")
                    .replaceFirst("[\\r\\n]+$", "");
            if (normalized.isBlank()) continue;
            String[] fields = normalized.split("\\u001f", -1);
            if (fields.length < 7) continue;
            result.add(new Commit(
                    fields[0], fields[1], fields[2], fields[3], fields[4],
                    words(fields[5]), commaSeparated(fields[6])
            ));
        }
        return List.copyOf(result);
    }

    public List<Worktree> worktrees(Path workspace) {
        String output = require(
                workspace, Map.of(), "worktree", "list", "--porcelain", "-z"
        );
        List<Worktree> result = new ArrayList<>();
        Map<String, String> fields = new LinkedHashMap<>();
        for (String token : output.split("\\u0000", -1)) {
            if (token.isEmpty()) {
                addWorktree(fields, result);
                fields.clear();
                continue;
            }
            int separator = token.indexOf(' ');
            String key = separator < 0 ? token : token.substring(0, separator);
            String value = separator < 0 ? "" : token.substring(separator + 1);
            fields.put(key, value);
        }
        addWorktree(fields, result);
        return List.copyOf(result);
    }

    public String resolveCommit(Path workspace, String revision) {
        String value = requireRevision(revision);
        return require(
                workspace, Map.of(), "rev-parse", "--verify", value + "^{commit}"
        ).trim();
    }

    public String resolveTree(Path workspace, String revision) {
        String value = requireRevision(revision);
        return require(
                workspace, Map.of(), "rev-parse", "--verify", value + "^{tree}"
        ).trim();
    }

    public String emptyTree(Path workspace) {
        Path temporaryIndex = temporaryIndex("lumora-empty-tree-");
        Map<String, String> environment = Map.of(
                "GIT_INDEX_FILE", temporaryIndex.toString()
        );
        try {
            require(workspace, environment, "read-tree", "--empty");
            return require(workspace, environment, "write-tree").trim();
        } finally {
            deleteTemporaryIndex(temporaryIndex);
        }
    }

    public void checkoutBranch(Path workspace, String branchName) {
        validateBranchName(workspace, branchName);
        if (!referenceTarget(
                workspace, "refs/heads/" + branchName
        ).isBlank()) {
            require(workspace, Map.of(), "switch", "--no-guess", branchName);
            return;
        }
        if (!referenceTarget(
                workspace, "refs/remotes/" + branchName
        ).isBlank()) {
            require(workspace, Map.of(), "switch", "--track", branchName);
            return;
        }
        throw new IllegalArgumentException("分支不存在");
    }

    public void createBranch(
            Path workspace,
            String branchName,
            String startPoint,
            boolean checkout
    ) {
        validateBranchName(workspace, branchName);
        String reference = "refs/heads/" + branchName;
        if (!referenceTarget(workspace, reference).isBlank()) {
            throw new IllegalArgumentException("分支名称已存在");
        }
        String currentHead = head(workspace);
        if (currentHead.isBlank()) {
            if (!checkout) {
                throw new IllegalStateException(
                        "尚未产生首个提交，只能创建并检出新的未出生分支"
                );
            }
            if (startPoint != null && !startPoint.isBlank()) {
                throw new IllegalArgumentException(
                        "尚未产生首个提交，不能指定分支起点"
                );
            }
            require(workspace, Map.of(), "symbolic-ref", "HEAD", reference);
            return;
        }
        String base = startPoint == null || startPoint.isBlank()
                ? currentHead : resolveCommit(workspace, startPoint);
        if (checkout) {
            require(workspace, Map.of(), "switch", "-c", branchName, base);
        } else {
            require(workspace, Map.of(), "branch", branchName, base);
        }
    }

    public void removeCleanWorktree(Path repositoryRoot, Path worktreePath) {
        Path primary = primaryWorktree(repositoryRoot);
        Path target = worktreePath.toAbsolutePath().normalize();
        if (target.equals(primary)) {
            throw new IllegalStateException("拒绝删除 Git 主工作树");
        }
        if (!Files.isDirectory(target)
                || !Files.isRegularFile(target.resolve(".git"))) {
            throw new IllegalStateException("目标不是可验证的 linked Worktree");
        }
        if (!status(target).clean()
                || !ignoredUntracked(target, 1).isEmpty()) {
            throw new IllegalStateException(
                    "Worktree 包含未处理修改或被忽略文件，拒绝删除"
            );
        }
        Result remove = run(primary, Map.of(), false,
                "worktree", "remove", target.toString());
        if (remove.exitCode() != 0) {
            throw new IllegalStateException(messageOrDefault(
                    remove.output(), "无法删除 Worktree"
            ));
        }
    }

    public void pruneWorktrees(Path repositoryRoot) {
        require(repositoryRoot, Map.of(), "worktree", "prune");
    }

    public String commitTree(Path workspace, String commit) {
        return require(workspace, Map.of(),
                "rev-parse", commit + "^{tree}").trim();
    }

    public String createInternalCommit(
            Path repositoryRoot,
            String tree,
            String message
    ) {
        return require(
                repositoryRoot, INTERNAL_IDENTITY,
                "commit-tree", tree, "-m", message
        ).trim();
    }

    public String referenceTarget(Path repositoryRoot, String reference) {
        Result result = run(repositoryRoot, Map.of(), false,
                "rev-parse", "--verify", reference);
        return result.exitCode() == 0 ? result.output().trim() : "";
    }

    public Path primaryWorktree(Path workspace) {
        String output = require(
                workspace, Map.of(), "worktree", "list", "--porcelain"
        );
        for (String line : output.split("\\R")) {
            if (!line.startsWith("worktree ")) continue;
            Path root = Path.of(line.substring("worktree ".length()).trim())
                    .toAbsolutePath().normalize();
            if (Files.isDirectory(root)) return root;
        }
        throw new IllegalStateException("无法定位 Git 主工作树");
    }

    public Snapshot snapshot(Path workspace) {
        String head = head(workspace);
        String indexTree = require(workspace, Map.of(), "write-tree").trim();
        Path temporaryIndex = temporaryIndex("lumora-snapshot-");
        Map<String, String> environment = Map.of(
                "GIT_INDEX_FILE", temporaryIndex.toString(),
                "GIT_WORK_TREE", workspace.toString()
        );
        try {
            require(workspace, environment, "read-tree", indexTree);
            require(workspace, environment, "add", "-A", "--", ".");
            String tree = require(
                    workspace, environment, "write-tree"
            ).trim();
            if (tree.isBlank()) {
                throw new IllegalStateException("Git 未返回工作区 tree");
            }
            return new Snapshot(tree, head, indexTree);
        } finally {
            deleteTemporaryIndex(temporaryIndex);
        }
    }

    public void createDetachedWorktree(
            Path repositoryRoot,
            Path worktreePath,
            String baseCommit,
            String baseTree
    ) {
        require(repositoryRoot, Map.of(), "worktree", "add", "--detach",
                worktreePath.toString(), baseCommit);
        try {
            materializeTree(
                    worktreePath,
                    commitTree(worktreePath, baseCommit),
                    baseTree
            );
        } catch (RuntimeException error) {
            removeWorktree(repositoryRoot, worktreePath);
            throw error;
        }
    }

    /**
     * Replaces working files with targetTree while leaving the real Git index
     * and HEAD untouched.
     */
    public void materializeTree(
            Path workspace,
            String currentTree,
            String targetTree
    ) {
        Path normalizedRoot = workspace.toAbsolutePath().normalize();
        for (RemovedPath removed : removedPaths(
                normalizedRoot, currentTree, targetTree
        )) {
            deleteWorkspacePath(normalizedRoot, removed.path());
        }
        Path temporaryIndex = temporaryIndex("lumora-materialize-");
        Map<String, String> environment = Map.of(
                "GIT_INDEX_FILE", temporaryIndex.toString(),
                "GIT_WORK_TREE", normalizedRoot.toString()
        );
        try {
            require(normalizedRoot, environment, "read-tree", targetTree);
            require(normalizedRoot, environment,
                    "checkout-index", "--all", "--force");
        } finally {
            deleteTemporaryIndex(temporaryIndex);
        }
    }

    public MergeResult mergeTrees(
            Path repositoryRoot,
            String baseTree,
            String localTree,
            String resultTree
    ) {
        String baseCommit = require(repositoryRoot, INTERNAL_IDENTITY,
                "commit-tree", baseTree, "-m", "Lumora merge base").trim();
        String localCommit = require(repositoryRoot, INTERNAL_IDENTITY,
                "commit-tree", localTree, "-p", baseCommit,
                "-m", "Lumora local side").trim();
        String isolatedCommit = require(repositoryRoot, INTERNAL_IDENTITY,
                "commit-tree", resultTree, "-p", baseCommit,
                "-m", "Lumora worktree side").trim();
        Result merge = run(repositoryRoot, Map.of(), true,
                "merge-tree", "--write-tree", localCommit, isolatedCommit);
        if (merge.exitCode() == 1) {
            return new MergeResult("", true, bounded(merge.output()));
        }
        if (merge.exitCode() != 0) {
            throw new IllegalStateException(messageOrDefault(
                    merge.output(), "Git 三方合并失败"
            ));
        }
        String mergedTree = merge.output().lines()
                .findFirst().orElse("").trim();
        if (mergedTree.isBlank()) {
            throw new IllegalStateException("Git 三方合并未返回结果 tree");
        }
        return new MergeResult(mergedTree, false, "");
    }

    public void keepTree(
            Path repositoryRoot,
            String reference,
            String tree
    ) {
        require(repositoryRoot, Map.of(),
                "update-ref", reference, tree);
    }

    public void deleteReference(Path repositoryRoot, String reference) {
        Result result = run(repositoryRoot, Map.of(), false,
                "update-ref", "-d", reference);
        if (result.exitCode() != 0) {
            throw new IllegalStateException(messageOrDefault(
                    result.output(), "无法删除 Lumora Git 引用"
            ));
        }
    }

    public void createBranch(
            Path worktreePath,
            String branchName,
            String baseCommit
    ) {
        validateBranchName(worktreePath, branchName);
        require(worktreePath, Map.of(),
                "switch", "-c", branchName, baseCommit);
    }

    /**
     * Converts an isolated synthetic baseline into a real unborn branch.
     * Working files are kept, while HEAD becomes an unborn symbolic ref and
     * the real Worktree index stays empty, so no user-visible commit is made.
     */
    public void createOrphanBranch(
            Path worktreePath,
            String branchName,
            String detachedBaseCommit,
            String expectedWorkingTree
    ) {
        validateBranchName(worktreePath, branchName);
        String reference = "refs/heads/" + branchName;
        if (!referenceTarget(worktreePath, reference).isBlank()) {
            throw new IllegalArgumentException("分支名称已存在");
        }
        try {
            require(worktreePath, Map.of(),
                    "symbolic-ref", "HEAD", reference);
            require(worktreePath, Map.of(), "read-tree", "--empty");
            Snapshot snapshot = snapshot(worktreePath);
            if (!snapshot.head().isBlank()
                    || !snapshot.tree().equals(expectedWorkingTree)) {
                throw new IllegalStateException(
                        "未能安全建立无首提分支"
                );
            }
        } catch (RuntimeException error) {
            restoreDetachedHead(worktreePath, detachedBaseCommit, error);
            throw error;
        }
    }

    public void removeWorktree(Path repositoryRoot, Path worktreePath) {
        Path primary = repositoryRoot.toAbsolutePath().normalize();
        Path target = worktreePath.toAbsolutePath().normalize();
        if (target.equals(primary)) {
            throw new IllegalStateException("拒绝删除 Git 主工作树");
        }
        if (Files.exists(target)
                && !Files.isRegularFile(target.resolve(".git"))) {
            throw new IllegalStateException("目标不是可验证的 Git Worktree");
        }
        Result remove = run(primary, Map.of(), false,
                "worktree", "remove", "--force", target.toString());
        if (remove.exitCode() != 0 && Files.exists(target)) {
            throw new IllegalStateException(messageOrDefault(
                    remove.output(), "无法删除临时 Worktree"
            ));
        }
        run(primary, Map.of(), false, "worktree", "prune");
    }

    private List<RemovedPath> removedPaths(
            Path workspace,
            String currentTree,
            String targetTree
    ) {
        if (currentTree.equals(targetTree)) return List.of();
        String output = require(workspace, Map.of(),
                "diff", "--name-status", "-z", "--find-renames",
                currentTree, targetTree, "--");
        List<String> fields = nulFields(output);
        List<RemovedPath> result = new ArrayList<>();
        int index = 0;
        while (index < fields.size()) {
            String status = fields.get(index++);
            if (status.isBlank() || index >= fields.size()) break;
            String firstPath = fields.get(index++);
            if (status.startsWith("D")) {
                result.add(new RemovedPath(firstPath));
            } else if ((status.startsWith("R") || status.startsWith("C"))
                    && index < fields.size()) {
                String targetPath = fields.get(index++);
                if (status.startsWith("R")
                        && !firstPath.equals(targetPath)) {
                    result.add(new RemovedPath(firstPath));
                }
            }
        }
        return result;
    }

    private void validateBranchName(Path worktreePath, String branchName) {
        Result validation = run(worktreePath, Map.of(), false,
                "check-ref-format", "--branch", branchName);
        if (validation.exitCode() != 0) {
            throw new IllegalArgumentException("分支名称不合法");
        }
    }

    private Counts aheadBehind(
            Path workspace,
            String reference,
            String upstream
    ) {
        Result result = run(workspace, Map.of(), false,
                "rev-list", "--left-right", "--count",
                reference + "..." + upstream);
        if (result.exitCode() != 0) return new Counts(0, 0);
        String[] values = result.output().trim().split("\\s+");
        return values.length < 2
                ? new Counts(0, 0)
                : new Counts(integer(values[0]), integer(values[1]));
    }

    private void addWorktree(
            Map<String, String> fields,
            List<Worktree> result
    ) {
        String rawPath = fields.getOrDefault("worktree", "");
        if (rawPath.isBlank()) return;
        result.add(new Worktree(
                Path.of(rawPath).toAbsolutePath().normalize(),
                fields.getOrDefault("HEAD", ""),
                fields.getOrDefault("branch", ""),
                fields.containsKey("detached"),
                fields.containsKey("locked"),
                fields.getOrDefault("prunable", "")
        ));
    }

    private String requireRevision(String value) {
        String revision = value == null ? "" : value.trim();
        if (revision.isBlank() || revision.startsWith("-")
                || revision.chars().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException("Git 引用不合法");
        }
        return revision;
    }

    private List<String> words(String value) {
        return value == null || value.isBlank()
                ? List.of() : List.of(value.trim().split("\\s+"));
    }

    private List<String> commaSeparated(String value) {
        if (value == null || value.isBlank()) return List.of();
        return Arrays.stream(value.split(","))
                .map(String::trim)
                .filter(item -> !item.isBlank())
                .toList();
    }

    private int integer(String value) {
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }

    private void restoreDetachedHead(
            Path worktreePath,
            String detachedBaseCommit,
            RuntimeException original
    ) {
        try {
            require(worktreePath, Map.of(), "update-ref", "--no-deref",
                    "HEAD", detachedBaseCommit);
            require(worktreePath, Map.of(), "read-tree", detachedBaseCommit);
        } catch (RuntimeException rollbackError) {
            original.addSuppressed(rollbackError);
        }
    }

    private void deleteWorkspacePath(Path root, String relativePath) {
        Path target = root.resolve(relativePath).normalize();
        Path gitMetadata = root.resolve(".git").normalize();
        if (!target.startsWith(root) || target.equals(root)
                || target.startsWith(gitMetadata)) {
            throw new IllegalStateException("Git 变更路径超出工作区");
        }
        if (!Files.exists(target, LinkOption.NOFOLLOW_LINKS)) return;
        try {
            if (Files.isDirectory(target, LinkOption.NOFOLLOW_LINKS)) {
                try (var paths = Files.walk(target)) {
                    for (Path path : paths.sorted(Comparator.reverseOrder())
                            .toList()) {
                        Files.deleteIfExists(path);
                    }
                }
            } else {
                Files.deleteIfExists(target);
            }
            removeEmptyParents(target.getParent(), root);
        } catch (IOException error) {
            throw new IllegalStateException(
                    "无法更新工作区路径: " + relativePath, error
            );
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

    private Path temporaryIndex(String prefix) {
        try {
            Path path = Files.createTempFile(prefix, ".idx");
            Files.deleteIfExists(path);
            return path;
        } catch (IOException error) {
            throw new IllegalStateException("无法创建临时 Git index", error);
        }
    }

    private void deleteTemporaryIndex(Path path) {
        try {
            Files.deleteIfExists(path);
        } catch (IOException ignored) {
            // The file lives outside the repository and is disposable.
        }
    }

    private String require(
            Path root,
            Map<String, String> environment,
            String... arguments
    ) {
        Result result = run(root, environment, true, arguments);
        if (result.exitCode() != 0) {
            throw new IllegalStateException(messageOrDefault(
                    result.output(), "Git 命令执行失败"
            ));
        }
        return result.output();
    }

    private Result run(
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
            return new Result(process.exitValue(), new String(
                    output.join(), StandardCharsets.UTF_8
            ));
        } catch (IOException error) {
            if (!failOnStart) return new Result(127, "Git 不可用");
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

    private List<String> nulFields(String output) {
        List<String> result = new ArrayList<>();
        int start = 0;
        for (int index = 0; index < output.length(); index += 1) {
            if (output.charAt(index) == '\0') {
                result.add(output.substring(start, index));
                start = index + 1;
            }
        }
        if (start < output.length()) result.add(output.substring(start));
        return result;
    }

    private String bounded(String output) {
        String normalized = output == null ? "" : output.trim();
        return normalized.length() <= 8_000
                ? normalized : normalized.substring(0, 8_000);
    }

    private String messageOrDefault(String message, String fallback) {
        return message == null || message.isBlank()
                ? fallback : message.trim();
    }

    public record Snapshot(String tree, String head, String indexTree) {
    }

    public record MergeResult(
            String tree,
            boolean conflicted,
            String details
    ) {
    }

    public record Status(
            boolean clean,
            int staged,
            int unstaged,
            int untracked,
            int conflicted,
            int ahead,
            int behind
    ) {
    }

    public record Branch(
            String name,
            boolean current,
            boolean remote,
            String headSha,
            String upstream,
            int ahead,
            int behind,
            String worktreePath
    ) {
    }

    public record Commit(
            String sha,
            String shortSha,
            String summary,
            String authorName,
            String authoredAt,
            List<String> parentShas,
            List<String> decorations
    ) {
        public Commit {
            parentShas = List.copyOf(parentShas);
            decorations = List.copyOf(decorations);
        }
    }

    public record Worktree(
            Path path,
            String headSha,
            String branchReference,
            boolean detached,
            boolean locked,
            String prunableReason
    ) {
    }

    private record Counts(int left, int right) {
    }

    private record RemovedPath(String path) {
    }

    private record Result(int exitCode, String output) {
    }
}
