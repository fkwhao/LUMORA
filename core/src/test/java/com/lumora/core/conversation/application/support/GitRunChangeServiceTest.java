package com.lumora.core.conversation.application.support;

import com.lumora.core.conversation.api.dto.response.ConversationRunChangesResponse;
import com.lumora.core.conversation.domain.entity.ConversationRun;
import com.lumora.core.conversation.domain.entity.ConversationRunChangeSet;
import com.lumora.core.conversation.infrastructure.persistence.ConversationRunChangeSetMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class GitRunChangeServiceTest {

    @TempDir
    Path repository;

    @Test
    void capturesDirtyBaselineAndRestoresModifiedAndUntrackedFiles()
            throws IOException {
        git("init");
        Files.writeString(repository.resolve("existing.txt"), "before\n");
        GitRunChangeService service = service();
        ConversationRun run = run("run-1");

        service.begin(run);
        Files.writeString(repository.resolve("existing.txt"), "after\n");
        Files.writeString(repository.resolve("created.txt"), "created\n");
        service.captureTerminal(run);

        ConversationRunChangesResponse changes = service.changes(
                "task-1", "run-1"
        );
        assertThat(changes.revertible()).isTrue();
        assertThat(changes.files()).extracting("path")
                .containsExactlyInAnyOrder("existing.txt", "created.txt");

        service.revert("task-1", "run-1");
        assertThat(Files.readString(repository.resolve("existing.txt")))
                .isEqualTo("before\n");
        assertThat(repository.resolve("created.txt")).doesNotExist();
    }

    @Test
    void disablesAutomaticRevertWhenTheRealIndexChanges()
            throws IOException {
        git("init");
        Files.writeString(repository.resolve("existing.txt"), "before\n");
        GitRunChangeService service = service();
        ConversationRun run = run("run-2");

        service.begin(run);
        Files.writeString(repository.resolve("existing.txt"), "after\n");
        git("add", "existing.txt");
        service.captureTerminal(run);

        ConversationRunChangesResponse changes = service.changes(
                "task-1", "run-2"
        );
        assertThat(changes.revertible()).isFalse();
        assertThat(changes.reason()).contains("暂存区");
    }

    @Test
    void refusesToOverwriteAnIgnoredFileAtADeletedPath() throws IOException {
        git("init");
        Files.writeString(repository.resolve(".gitignore"), "deleted.txt\n");
        Files.writeString(repository.resolve("deleted.txt"), "before\n");
        git("add", ".gitignore");
        git("add", "--force", "deleted.txt");
        GitRunChangeService service = service();
        ConversationRun run = run("run-3");

        service.begin(run);
        Files.delete(repository.resolve("deleted.txt"));
        service.captureTerminal(run);
        Files.writeString(repository.resolve("deleted.txt"), "later\n");

        assertThatThrownBy(() -> service.revert("task-1", "run-3"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("拒绝自动撤回");
        assertThat(Files.readString(repository.resolve("deleted.txt")))
                .isEqualTo("later\n");
    }

    @Test
    void disablesTrackingForEveryConcurrentRunInTheSameRepository()
            throws IOException {
        git("init");
        GitRunChangeService service = service();
        ConversationRun first = run("run-4");
        ConversationRun second = run("run-5");

        service.begin(first);
        service.begin(second);

        assertThat(service.changes("task-1", "run-4").status())
                .isEqualTo("COLLIDED");
        assertThat(service.changes("task-1", "run-5").status())
                .isEqualTo("COLLIDED");
        assertThat(service.changes("task-1", "run-4").revertible())
                .isFalse();

        service.captureTerminal(first);
        assertThat(service.changes("task-1", "run-4").status())
                .isEqualTo("UNAVAILABLE");
        service.captureTerminal(second);
        assertThat(service.changes("task-1", "run-5").status())
                .isEqualTo("UNAVAILABLE");
    }

    @Test
    void refusesRevertWhileAnotherRunOwnsTheRepositoryLease()
            throws IOException {
        git("init");
        Files.writeString(repository.resolve("existing.txt"), "before\n");
        GitRunChangeService service = service();
        ConversationRun completed = run("run-6");
        service.begin(completed);
        Files.writeString(repository.resolve("existing.txt"), "after\n");
        service.captureTerminal(completed);

        service.begin(run("run-7"));

        assertThatThrownBy(() -> service.revert("task-1", "run-6"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("其他活动 Run");
        assertThat(Files.readString(repository.resolve("existing.txt")))
                .isEqualTo("after\n");
    }

    private GitRunChangeService service() {
        ConversationRunChangeSetMapper mapper = mock(
                ConversationRunChangeSetMapper.class
        );
        Map<String, ConversationRunChangeSet> records = new LinkedHashMap<>();
        when(mapper.selectById(any())).thenAnswer(invocation ->
                records.get(invocation.<String>getArgument(0)));
        when(mapper.selectList(any())).thenAnswer(invocation ->
                records.values().stream().toList());
        when(mapper.insert(any(ConversationRunChangeSet.class)))
                .thenAnswer(invocation -> {
            ConversationRunChangeSet value = invocation.getArgument(0);
            records.put(value.getRunId(), value);
            return 1;
        });
        when(mapper.updateById(any(ConversationRunChangeSet.class)))
                .thenAnswer(invocation -> {
            ConversationRunChangeSet value = invocation.getArgument(0);
            records.put(value.getRunId(), value);
            return 1;
        });
        return new GitRunChangeService(
                mapper,
                Clock.fixed(
                        Instant.parse("2026-08-22T00:00:00Z"),
                        ZoneOffset.UTC
                )
        );
    }

    private ConversationRun run(String runId) {
        ConversationRun run = new ConversationRun();
        run.setRunId(runId);
        run.setTaskId("task-1");
        run.setWorkspacePath(repository.toString());
        return run;
    }

    private void git(String... arguments) throws IOException {
        String[] command = new String[arguments.length + 3];
        command[0] = "git";
        command[1] = "-C";
        command[2] = repository.toString();
        System.arraycopy(arguments, 0, command, 3, arguments.length);
        Process process = new ProcessBuilder(command)
                .redirectErrorStream(true)
                .start();
        try {
            int exitCode = process.waitFor();
            assertThat(exitCode)
                    .withFailMessage(new String(process.getInputStream()
                            .readAllBytes()))
                    .isZero();
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(error);
        }
    }
}
