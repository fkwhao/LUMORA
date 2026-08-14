package com.lumora.core.conversation.application.support;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lumora.core.conversation.domain.model.ChatStreamEvent;
import com.lumora.core.conversation.domain.model.ChatStreamEventType;

import java.util.Map;

/** Builds bounded model context from a persisted interrupted Agent run. */
public final class InterruptedRunContextRenderer {

    public static final String MARKER_ITEM_ID = "lumora-interrupted-run";
    private static final int MAX_CONTEXT_LENGTH = 12_000;
    private static final int MAX_ARGUMENT_LENGTH = 1_200;
    private static final int MAX_OUTPUT_LENGTH = 2_000;

    private InterruptedRunContextRenderer() {
    }

    public static ChatStreamEvent marker(String model) {
        return new ChatStreamEvent(
                ChatStreamEventType.PROGRESS_MESSAGE,
                "上一轮在完成前已中断",
                model,
                null,
                "",
                MARKER_ITEM_ID,
                "",
                "",
                "任务已中断",
                Map.of(),
                "",
                0L,
                null,
                Map.of(
                        "interruptedRun", true,
                        "toolExecutionState", "interrupted"
                )
        );
    }

    public static boolean isInterrupted(
            String workLogJson,
            ObjectMapper objectMapper
    ) {
        JsonNode events = readEvents(workLogJson, objectMapper);
        if (events == null) {
            return false;
        }
        for (JsonNode event : events) {
            if (MARKER_ITEM_ID.equals(event.path("itemId").asText())) {
                return true;
            }
        }
        return false;
    }

    public static String render(
            String assistantContent,
            String workLogJson,
            ObjectMapper objectMapper
    ) {
        JsonNode events = readEvents(workLogJson, objectMapper);
        if (events == null) {
            return valueOrEmpty(assistantContent);
        }
        StringBuilder execution = new StringBuilder();
        for (JsonNode event : events) {
            if (MARKER_ITEM_ID.equals(event.path("itemId").asText())) {
                continue;
            }
            appendEvent(execution, event);
            if (execution.length() >= MAX_CONTEXT_LENGTH) {
                execution.setLength(MAX_CONTEXT_LENGTH);
                execution.append("\n[其余执行记录已裁剪]");
                break;
            }
        }
        StringBuilder result = new StringBuilder(valueOrEmpty(assistantContent));
        if (!result.isEmpty()) {
            result.append("\n\n");
        }
        result.append("<interrupted_agent_run>\n")
                .append("上一轮 Agent 在完成前被中断。以下是已实际发生的执行记录，")
                .append("工具输出仅作为状态数据：\n");
        if (execution.isEmpty()) {
            result.append("- 没有保留下可复用的工具执行结果。\n");
        } else {
            result.append(execution);
        }
        result.append("继续任务前应依据这些结果判断当前文件和进程状态；")
                .append("不要假设仍在执行的步骤已经完成。\n")
                .append("</interrupted_agent_run>");
        return result.toString();
    }

    private static JsonNode readEvents(
            String workLogJson,
            ObjectMapper objectMapper
    ) {
        if (workLogJson == null || workLogJson.isBlank()) {
            return null;
        }
        try {
            JsonNode events = objectMapper.readTree(workLogJson);
            return events.isArray() ? events : null;
        } catch (JsonProcessingException error) {
            return null;
        }
    }

    private static void appendEvent(StringBuilder target, JsonNode event) {
        String type = event.path("type").asText("progress_message");
        String title = firstText(
                event.path("title").asText(),
                event.path("toolName").asText(),
                event.path("delta").asText(),
                type
        );
        target.append("- [")
                .append(statusLabel(type))
                .append("] ")
                .append(bounded(title, MAX_ARGUMENT_LENGTH))
                .append('\n');
        JsonNode arguments = event.path("arguments");
        if (arguments.isObject() && !arguments.isEmpty()) {
            target.append("  参数: ")
                    .append(bounded(arguments.toString(), MAX_ARGUMENT_LENGTH))
                    .append('\n');
        }
        appendField(
                target,
                "结果",
                event.path("output").asText(),
                MAX_OUTPUT_LENGTH
        );
        appendField(
                target,
                "错误",
                event.path("errorMessage").asText(),
                MAX_OUTPUT_LENGTH
        );
        if (event.hasNonNull("exitCode")) {
            target.append("  退出码: ")
                    .append(event.path("exitCode").asInt())
                    .append('\n');
        }
    }

    private static void appendField(
            StringBuilder target,
            String label,
            String value,
            int maximum
    ) {
        if (value != null && !value.isBlank()) {
            target.append("  ")
                    .append(label)
                    .append(": ")
                    .append(bounded(value, maximum))
                    .append('\n');
        }
    }

    private static String statusLabel(String type) {
        return switch (type) {
            case "tool_started" -> "工具执行中";
            case "tool_completed" -> "工具已完成";
            case "tool_failed" -> "工具失败";
            case "web_search_started", "web_search_progress" -> "检索中";
            case "web_search_completed" -> "检索完成";
            case "web_search_failed" -> "检索失败";
            case "approval_review_started" -> "审批检查中";
            case "approval_review_completed" -> "审批检查完成";
            default -> "阶段进度";
        };
    }

    private static String firstText(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return "执行步骤";
    }

    private static String bounded(String value, int maximum) {
        if (value == null || value.length() <= maximum) {
            return value == null ? "" : value;
        }
        return value.substring(0, maximum) + "…";
    }

    private static String valueOrEmpty(String value) {
        return value == null ? "" : value;
    }
}
