package com.lumora.core.shared.infrastructure.git;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GitWorkspaceOperationsTest {

    @TempDir
    Path temporaryDirectory;

    private final GitWorkspaceOperations git = new GitWorkspaceOperations();

    @Test
    void projectsStatusBranchesHistoryAndLinkedWorktrees() throws Exception {
        Path repository = repository("project");
        Files.writeString(repository.resolve("tracked.txt"), "before\n");
        Files.writeString(repository.resolve(".gitignore"), "ignored.log\n");
        command(repository, "add", "tracked.txt", ".gitignore");
        command(repository, "commit", "-m", "initial change");

        assertThat(git.currentBranch(repository)).isEqualTo("main");
        assertThat(git.branches(repository))
                .anySatisfy(branch -> {
                    assertThat(branch.name()).isEqualTo("main");
                    assertThat(branch.current()).isTrue();
                });
        assertThat(git.history(repository, 10, ""))
                .singleElement()
                .satisfies(commit -> {
                    assertThat(commit.summary()).isEqualTo("initial change");
                    assertThat(commit.parentShas()).isEmpty();
                });

        Files.writeString(repository.resolve("tracked.txt"), "after\n");
        Files.writeString(repository.resolve("staged.txt"), "staged\n");
        command(repository, "add", "staged.txt");
        Files.writeString(repository.resolve("untracked.txt"), "new\n");
        GitWorkspaceOperations.Status status = git.status(repository);
        assertThat(status.clean()).isFalse();
        assertThat(status.staged()).isEqualTo(1);
        assertThat(status.unstaged()).isEqualTo(1);
        assertThat(status.untracked()).isEqualTo(1);

        command(repository, "restore", "tracked.txt");
        command(repository, "restore", "--staged", "staged.txt");
        Files.delete(repository.resolve("staged.txt"));
        Files.delete(repository.resolve("untracked.txt"));
        command(repository, "branch", "isolated");
        Path linked = temporaryDirectory.resolve("linked");
        command(repository, "worktree", "add", linked.toString(), "isolated");
        assertThat(git.worktrees(repository))
                .extracting(item -> item.path().getFileName().toString())
                .contains("project", "linked");

        Files.writeString(linked.resolve("ignored.log"), "must survive\n");
        assertThat(git.status(linked).clean()).isTrue();
        assertThat(git.ignoredUntracked(linked, 1))
                .containsExactly("ignored.log");
        assertThatThrownBy(() -> git.removeCleanWorktree(repository, linked))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("被忽略文件");
        assertThat(Files.exists(linked.resolve("ignored.log"))).isTrue();
        Files.delete(linked.resolve("ignored.log"));

        Files.writeString(linked.resolve("tracked.txt"), "dirty\n");
        assertThatThrownBy(() -> git.removeCleanWorktree(repository, linked))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("未处理修改");
        command(linked, "restore", "tracked.txt");
        git.removeCleanWorktree(repository, linked);
        assertThat(Files.exists(linked)).isFalse();
    }

    @Test
    void createsAndChecksOutAnUnbornBranchWithoutInventingACommit()
            throws Exception {
        Path repository = repository("unborn");

        git.createBranch(repository, "feature/first", "", true);

        assertThat(git.head(repository)).isEmpty();
        assertThat(git.currentBranch(repository)).isEqualTo("feature/first");
    }

    private Path repository(String name) throws Exception {
        Path result = temporaryDirectory.resolve(name);
        Files.createDirectories(result);
        command(result, "init", "-b", "main");
        command(result, "config", "user.name", "Lumora Test");
        command(result, "config", "user.email", "lumora@example.invalid");
        return result;
    }

    private void command(Path root, String... arguments) throws Exception {
        String[] command = new String[arguments.length + 4];
        command[0] = "git";
        command[1] = "-c";
        command[2] = "core.autocrlf=false";
        command[3] = "-C";
        String[] complete = new String[arguments.length + 5];
        System.arraycopy(command, 0, complete, 0, command.length);
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
