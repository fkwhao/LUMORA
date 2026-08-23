package com.lumora.core.task.application.support;

import com.lumora.core.conversation.api.dto.response.ConversationFileChangeResponse;
import com.lumora.core.conversation.application.support.GitRunChangeService;
import com.lumora.core.task.api.dto.response.TaskWorktreeChangesResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

/** Builds the cumulative review projection for an isolated task result. */
@Service
@RequiredArgsConstructor
public class TaskWorktreeChangeService {

    private final TaskWorktreeService worktreeService;
    private final GitRunChangeService gitRunChangeService;

    public TaskWorktreeChangesResponse changes(String taskId) {
        TaskWorktreeService.ChangeRange range = worktreeService.changeRange(
                taskId
        );
        if (range == null) return null;
        List<ConversationFileChangeResponse> files =
                gitRunChangeService.diffTrees(
                        range.repositoryRoot(), range.beforeTree(),
                        range.afterTree()
                );
        int additions = files.stream().mapToInt(
                ConversationFileChangeResponse::additions
        ).sum();
        int deletions = files.stream().mapToInt(
                ConversationFileChangeResponse::deletions
        ).sum();
        return new TaskWorktreeChangesResponse(
                range.taskId(), range.status(), range.repositoryRoot(),
                range.reason(), additions, deletions, files
        );
    }
}
