package com.lumora.core.task.application.support;

import com.lumora.core.conversation.domain.entity.ConversationRun;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.util.ReflectionTestUtils;
import static org.assertj.core.api.Assertions.assertThat;

class IssueListWorktreeReproductionTest {
    @TempDir Path temporaryDirectory;

    @Test void lm001PostReviewManualEditMustSurviveApply() throws Exception {
        var existing = new TaskWorktreeServiceTest();
        existing.temporaryDirectory = temporaryDirectory;
        Path repository = ReflectionTestUtils.invokeMethod(existing, "createRepository");
        Object fixture = ReflectionTestUtils.invokeMethod(existing, "fixture");
        TaskWorktreeService service = ReflectionTestUtils.invokeMethod(fixture, "service");
        ConversationRun run = ReflectionTestUtils.invokeMethod(existing, "run", "issue-lm001", repository);
        ReflectionTestUtils.invokeMethod(existing, "selectWorktree", fixture, run);
        Path isolated = Path.of(service.acquireForRun(run));
        Files.writeString(isolated.resolve("isolated.txt"), "agent-result\n");
        service.onRunTerminal(run);
        assertThat(service.status(run.getTaskId()).worktreeState()).isEqualTo("WAITING_REVIEW");
        Files.writeString(isolated.resolve("isolated.txt"), "manual-after-review\n");
        var review = service.apply(run.getTaskId());
        assertThat(review.worktreeState()).isEqualTo("WAITING_REVIEW");
        assertThat(Files.readString(isolated.resolve("isolated.txt"))).contains("manual-after-review");
        var result = service.apply(run.getTaskId());
        String applied = Files.readString(repository.resolve("isolated.txt"));
        boolean retained = Files.exists(isolated.resolve("isolated.txt"))
                && Files.readString(isolated.resolve("isolated.txt")).contains("manual-after-review");
        System.out.println("REPRO LM-001 state=" + result.worktreeState()
                + " local=" + applied.strip() + " worktreeExists=" + Files.exists(isolated)
                + " manualRetained=" + retained);
        assertThat(applied.contains("manual-after-review") || retained)
                .as("LM-001: post-review manual edits must be applied or retained").isTrue();
    }
}
