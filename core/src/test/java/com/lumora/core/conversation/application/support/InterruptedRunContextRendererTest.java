package com.lumora.core.conversation.application.support;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lumora.core.conversation.domain.model.ChatStreamEvent;
import com.lumora.core.conversation.domain.model.ChatStreamEventType;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class InterruptedRunContextRendererTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void rendersBoundedToolHistoryForTheNextModelTurn() throws Exception {
        ChatStreamEvent completedTool = new ChatStreamEvent(
                ChatStreamEventType.TOOL_COMPLETED,
                "",
                "model",
                null,
                "",
                "tool-1",
                "call-1",
                "shell_command",
                "运行测试",
                Map.of("command", "mvn test"),
                "BUILD SUCCESS",
                120L,
                0,
                Map.of()
        );
        String workLogJson = objectMapper.writeValueAsString(List.of(
                completedTool,
                InterruptedRunContextRenderer.marker("model")
        ));

        assertThat(InterruptedRunContextRenderer.isInterrupted(
                workLogJson,
                objectMapper
        )).isTrue();
        String context = InterruptedRunContextRenderer.render(
                "我已经开始检查项目。",
                workLogJson,
                objectMapper
        );

        assertThat(context).contains(
                "我已经开始检查项目。",
                "上一轮 Agent 在完成前被中断",
                "运行测试",
                "mvn test",
                "BUILD SUCCESS",
                "不要假设仍在执行的步骤已经完成"
        );
        assertThat(context).doesNotContain(
                InterruptedRunContextRenderer.MARKER_ITEM_ID
        );
    }
}
