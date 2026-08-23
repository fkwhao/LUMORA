package com.lumora.core.task.application.support;

import com.lumora.core.conversation.api.dto.response.ConversationFileChangeResponse;
import com.lumora.core.conversation.application.support.GitRunChangeService;
import com.lumora.core.task.api.dto.response.TaskWorktreeChangesResponse;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TaskWorktreeChangeServiceTest {

    @Test
    void projectsTheCompleteTreeRangeAndTotals() {
        TaskWorktreeService worktrees = mock(TaskWorktreeService.class);
        GitRunChangeService gitChanges = mock(GitRunChangeService.class);
        when(worktrees.changeRange("task-1")).thenReturn(
                new TaskWorktreeService.ChangeRange(
                        "task-1", "WAITING_REVIEW", "C:/project",
                        "等待审阅", "tree-before", "tree-after"
                )
        );
        when(gitChanges.diffTrees(
                "C:/project", "tree-before", "tree-after"
        )).thenReturn(List.of(
                file("src/one.java", 4, 1),
                file("src/two.java", 2, 3)
        ));
        TaskWorktreeChangeService service = new TaskWorktreeChangeService(
                worktrees, gitChanges
        );

        TaskWorktreeChangesResponse result = service.changes("task-1");

        assertThat(result.additions()).isEqualTo(6);
        assertThat(result.deletions()).isEqualTo(4);
        assertThat(result.files()).hasSize(2);
    }

    private ConversationFileChangeResponse file(
            String path,
            int additions,
            int deletions
    ) {
        return new ConversationFileChangeResponse(
                path, "", "MODIFIED", additions, deletions,
                false, "", false
        );
    }
}
