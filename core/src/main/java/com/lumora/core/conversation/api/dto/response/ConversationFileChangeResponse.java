package com.lumora.core.conversation.api.dto.response;

public record ConversationFileChangeResponse(
        String path,
        String previousPath,
        String status,
        int additions,
        int deletions,
        boolean binary,
        String patch,
        boolean patchTruncated
) {
}
