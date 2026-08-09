package com.lumora.core.conversation.application.support;

import com.lumora.core.conversation.domain.model.ChatStreamEvent;
import com.lumora.core.conversation.domain.model.ChatStreamEventType;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ConversationStreamAccumulatorTest {

    @Test
    void replacesLiveApprovalReviewWithItsPersistedResult() {
        ConversationStreamAccumulator accumulator =
                new ConversationStreamAccumulator();
        accumulator.accept(reviewEvent(
                ChatStreamEventType.APPROVAL_REVIEW_STARTED,
                "",
                Map.of("approvalReviewDecision", "reviewing")
        ));
        accumulator.accept(reviewEvent(
                ChatStreamEventType.APPROVAL_REVIEW_COMPLETED,
                "Approved for this call.",
                Map.of("approvalReviewDecision", "allow_once")
        ));

        assertThat(accumulator.getWorkLogEvents()).hasSize(1);
        ChatStreamEvent persisted = accumulator.getWorkLogEvents().get(0);
        assertThat(persisted.getType())
                .isEqualTo(ChatStreamEventType.APPROVAL_REVIEW_COMPLETED);
        assertThat(persisted.getOutput()).isEqualTo("Approved for this call.");
        assertThat(persisted.getMetadata())
                .containsEntry("approvalReviewDecision", "allow_once");
    }

    private ChatStreamEvent reviewEvent(
            ChatStreamEventType type,
            String output,
            Map<String, Object> metadata
    ) {
        return new ChatStreamEvent(
                type,
                "",
                "model",
                null,
                "",
                "approval-review-item-1",
                "call-1",
                "shell_command",
                "git push origin main",
                Map.of("command", "git push origin main"),
                output,
                20L,
                null,
                metadata
        );
    }
}
