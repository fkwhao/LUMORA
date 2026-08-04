package com.lumora.core.agent.dto.request;

import java.util.List;

/**
 * Prompt 组装所需的运行时上下文。
 *
 * <p>这里传递结构化事实，不在 Java 侧拼接自然语言 Prompt。Python Agent Runtime
 * 负责根据信任级别和目标字段将它们装配到 system、messages 与 tools。</p>
 */
public class AgentPromptContextRequest {

    private final String workspacePath;
    private final List<String> projectInstructions;
    private final List<String> availableTools;
    private final String memorySummary;

    public AgentPromptContextRequest(
            String workspacePath,
            List<String> projectInstructions,
            List<String> availableTools,
            String memorySummary
    ) {
        this.workspacePath = workspacePath;
        this.projectInstructions = List.copyOf(projectInstructions);
        this.availableTools = List.copyOf(availableTools);
        this.memorySummary = memorySummary;
    }

    public static AgentPromptContextRequest defaultContext() {
        return withMemorySummary(null);
    }

    public static AgentPromptContextRequest withMemorySummary(
            String memorySummary
    ) {
        return new AgentPromptContextRequest(
                null,
                List.of(),
                List.of(),
                memorySummary
        );
    }

    public static AgentPromptContextRequest forWorkspace(
            String memorySummary,
            String workspacePath
    ) {
        if (workspacePath == null || workspacePath.isBlank()) {
            return withMemorySummary(memorySummary);
        }
        return new AgentPromptContextRequest(
                workspacePath.trim(),
                List.of(),
                List.of(
                        "list_files",
                        "search_in_file",
                        "read_file",
                        "apply_patch",
                        "write_file",
                        "shell_command"
                ),
                memorySummary
        );
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

}
