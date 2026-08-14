package com.lumora.core.conversation.application.support;

import com.lumora.core.conversation.domain.model.ChatStreamEvent;
import com.lumora.core.conversation.domain.model.ChatStreamEventType;
import com.lumora.core.conversation.domain.model.TokenUsage;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ConversationStreamAccumulatorTest {

    @Test
    void resetsProvisionalAnswerBeforePersistingFinalText() {
        ConversationStreamAccumulator accumulator =
                new ConversationStreamAccumulator();
        accumulator.accept(new ChatStreamEvent(
                ChatStreamEventType.TEXT_DELTA,
                "继续检索。",
                "model",
                null,
                ""
        ));
        accumulator.accept(new ChatStreamEvent(
                ChatStreamEventType.TEXT_RESET,
                "",
                "model",
                null,
                ""
        ));
        accumulator.accept(new ChatStreamEvent(
                ChatStreamEventType.TEXT_DELTA,
                "最终答案。",
                "model",
                null,
                ""
        ));

        assertThat(accumulator.getContent()).isEqualTo("最终答案。");
    }

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

    @Test
    void keepsTheLatestCumulativeUsageSnapshot() {
        ConversationStreamAccumulator accumulator =
                new ConversationStreamAccumulator();

        accumulator.accept(usageEvent(new TokenUsage(10, 2, 12)));
        accumulator.accept(usageEvent(new TokenUsage(30, 5, 35)));

        assertThat(accumulator.hasBillableUsage()).isTrue();
        assertThat(accumulator.getUsage().getTotalTokens()).isEqualTo(35);
    }

    @Test
    void capturesUsageAttachedToAFailedEventBeforeThrowing() {
        ConversationStreamAccumulator accumulator =
                new ConversationStreamAccumulator();
        ChatStreamEvent failed = new ChatStreamEvent(
                ChatStreamEventType.FAILED,
                "",
                "model",
                new TokenUsage(18, 3, 21),
                "provider failed"
        );

        assertThrows(IllegalStateException.class, () -> accumulator.accept(failed));

        assertThat(accumulator.hasBillableUsage()).isTrue();
        assertThat(accumulator.getUsage().getTotalTokens()).isEqualTo(21);
    }

    private ChatStreamEvent usageEvent(TokenUsage usage) {
        return new ChatStreamEvent(
                ChatStreamEventType.USAGE,
                "",
                "model",
                usage,
                ""
        );
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
