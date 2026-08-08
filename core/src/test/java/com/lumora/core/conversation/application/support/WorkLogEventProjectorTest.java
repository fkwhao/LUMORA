package com.lumora.core.conversation.application.support;

import com.lumora.core.conversation.application.support.WorkLogEventProjector;
import com.lumora.core.conversation.domain.model.ChatStreamEvent;
import com.lumora.core.conversation.domain.model.ChatStreamEventType;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

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
}
