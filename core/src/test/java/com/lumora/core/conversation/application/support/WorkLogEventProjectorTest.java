package com.lumora.core.conversation.application.support;

import com.lumora.core.conversation.application.support.WorkLogEventProjector;
import com.lumora.core.conversation.domain.model.ChatStreamEvent;
import com.lumora.core.conversation.domain.model.ChatStreamEventType;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.entry;

class WorkLogEventProjectorTest {

    @Test
    void retainsBoundedPatchPreviewAndBoundsPersistedOutput() {
        ChatStreamEvent event = new ChatStreamEvent(
                ChatStreamEventType.TOOL_COMPLETED,
                "",
                "model",
                null,
                "",
                "item-1",
                "call-1",
                "apply_patch",
                "src/example.ts",
                Map.of(
                        "path", "src/example.ts",
                        "oldText", "old text",
                        "newText", "new text"
                ),
                "x".repeat(10_000),
                12L,
                0,
                Map.of("path", "src/example.ts", "internal", "hidden")
        );

        ChatStreamEvent projected = WorkLogEventProjector.project(event);

        assertThat(projected.getArguments().get("oldText"))
                .isEqualTo("old text");
        assertThat(projected.getArguments().get("newText"))
                .isEqualTo("new text");
        assertThat(projected.getOutput()).hasSize(8_001);
        assertThat(projected.getMetadata()).containsOnlyKeys("path");
    }

    @Test
    void retainsCompactApprovalReviewAuditMetadata() {
        ChatStreamEvent event = new ChatStreamEvent(
                ChatStreamEventType.APPROVAL_REVIEW_COMPLETED,
                "",
                "model",
                null,
                "",
                "approval-review-item-1",
                "call-1",
                "shell_command",
                "git push origin main",
                Map.of("command", "git push origin main"),
                "The requested non-force push is scoped to origin/main.",
                420L,
                null,
                Map.of(
                        "approvalReviewer", "agent",
                        "approvalReviewDecision", "allow_once",
                        "approvalReviewRiskLevel", "MEDIUM",
                        "approvalReviewerModel", "reviewer-model",
                        "workspacePath", "F:\\project\\example",
                        "internal", "hidden"
                )
        );

        ChatStreamEvent projected = WorkLogEventProjector.project(event);

        assertThat(projected.getMetadata()).containsOnly(
                entry("approvalReviewer", "agent"),
                entry("approvalReviewDecision", "allow_once"),
                entry("approvalReviewRiskLevel", "MEDIUM"),
                entry("approvalReviewerModel", "reviewer-model"),
                entry("workspacePath", "F:\\project\\example")
        );
        assertThat(projected.getOutput()).contains("non-force push");
        assertThat(projected.getDurationMs()).isEqualTo(420L);
    }
}
