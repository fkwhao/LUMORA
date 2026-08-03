package com.lumora.core.agent.dto.request;

import java.util.List;
import java.util.Map;

/**
 * Prompt 组装所需的运行时上下文。
 *
 * <p>这里传递结构化事实，不在 Java 侧拼接自然语言 Prompt。Python Agent Runtime
 * 负责根据信任级别和目标字段将它们装配到 system、messages 与 tools。</p>
 */
public class AgentPromptContextRequest {

    private final String responseLanguage;
    private final String workspacePath;
    private final List<String> projectInstructions;
    private final List<String> availableTools;
    private final String memorySummary;
    private final List<String> systemReminders;
    private final List<Map<String, Object>> toolDefinitions;

    public AgentPromptContextRequest(
            String responseLanguage,
            String workspacePath,
            List<String> projectInstructions,
            List<String> availableTools,
            String memorySummary,
            List<String> systemReminders,
            List<Map<String, Object>> toolDefinitions
    ) {
        this.responseLanguage = responseLanguage;
        this.workspacePath = workspacePath;
        this.projectInstructions = List.copyOf(projectInstructions);
        this.availableTools = List.copyOf(availableTools);
        this.memorySummary = memorySummary;
        this.systemReminders = List.copyOf(systemReminders);
        this.toolDefinitions = toolDefinitions.stream()
                .map(Map::copyOf)
                .toList();
    }

    public static AgentPromptContextRequest defaultContext() {
        return withMemorySummary(null);
    }

    public static AgentPromptContextRequest withMemorySummary(
            String memorySummary
    ) {
        return new AgentPromptContextRequest(
                "简体中文",
                null,
                List.of(),
                List.of(),
                memorySummary,
                List.of(),
                List.of()
        );
    }

    public String getResponseLanguage() {
        return responseLanguage;
    }

    public String getWorkspacePath() {
        return workspacePath;
    }

    public List<String> getProjectInstructions() {
        return projectInstructions;
    }

    public List<String> getAvailableTools() {
        return availableTools;
    }

    public String getMemorySummary() {
        return memorySummary;
    }

    public List<String> getSystemReminders() {
        return systemReminders;
    }

    public List<Map<String, Object>> getToolDefinitions() {
        return toolDefinitions;
    }
}
