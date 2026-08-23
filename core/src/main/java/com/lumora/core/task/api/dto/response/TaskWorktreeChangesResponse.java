package com.lumora.core.task.api.dto.response;

import com.lumora.core.conversation.api.dto.response.ConversationFileChangeResponse;

import java.util.List;

/** Complete task result from the Worktree base tree to its latest tree. */
public record TaskWorktreeChangesResponse(
        String taskId,
        String status,
        String repositoryRoot,
        String reason,
        int additions,
        int deletions,
        List<ConversationFileChangeResponse> files
) {
    public TaskWorktreeChangesResponse {
        files = List.copyOf(files);
    }
}
