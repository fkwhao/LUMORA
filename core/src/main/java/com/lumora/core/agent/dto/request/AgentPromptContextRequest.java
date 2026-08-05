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
    private final String permissionMode;
    private final String taskId;
    private final String conversationSummary;

    public AgentPromptContextRequest(
            String workspacePath,
            List<String> projectInstructions,
            List<String> availableTools,
            String memorySummary
    ) {
        this(
                workspacePath,
                projectInstructions,
                availableTools,
                memorySummary,
                "request_approval",
                null,
                null
        );
    }

    public AgentPromptContextRequest(
            String workspacePath,
            List<String> projectInstructions,
            List<String> availableTools,
            String memorySummary,
            String permissionMode
    ) {
        this(workspacePath, projectInstructions, availableTools,
                memorySummary, permissionMode, null, null);
    }

    public AgentPromptContextRequest(
            String workspacePath,
            List<String> projectInstructions,
            List<String> availableTools,
            String memorySummary,
            String permissionMode,
            String taskId,
            String conversationSummary
    ) {
        this.workspacePath = workspacePath;
        this.projectInstructions = List.copyOf(projectInstructions);
        this.availableTools = List.copyOf(availableTools);
        this.memorySummary = memorySummary;
        this.permissionMode = normalizePermissionMode(permissionMode);
        this.taskId = taskId;
        this.conversationSummary = conversationSummary;
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
        return forWorkspace(
                memorySummary,
                workspacePath,
                "request_approval"
        );
    }

    public static AgentPromptContextRequest forWorkspace(
            String memorySummary,
            String workspacePath,
            String permissionMode
    ) {
        if (workspacePath == null || workspacePath.isBlank()) {
            return new AgentPromptContextRequest(
                    null,
                    List.of(),
                    List.of(),
                    memorySummary,
                    permissionMode
            );
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
                        "shell_command",
                        "artifact_read",
                        "artifact_search"
                ),
                memorySummary,
                permissionMode
        );
    }

    public static AgentPromptContextRequest forWorkspace(
            String memorySummary,
            String workspacePath,
            String permissionMode,
            String taskId,
            String conversationSummary
    ) {
        AgentPromptContextRequest base = forWorkspace(
                memorySummary, workspacePath, permissionMode
        );
        return new AgentPromptContextRequest(
                base.workspacePath,
                base.projectInstructions,
                base.availableTools,
                memorySummary,
                permissionMode,
                taskId,
                conversationSummary
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

    public String getPermissionMode() {
        return permissionMode;
    }

    public String getTaskId() { return taskId; }

    public String getConversationSummary() { return conversationSummary; }

    private static String normalizePermissionMode(String value) {
        String normalized = value == null || value.isBlank()
                ? "request_approval"
                : value.trim();
        if (!List.of("full_access", "auto_approve", "request_approval")
                .contains(normalized)) {
            throw new IllegalArgumentException("权限模式无效");
        }
        return normalized;
    }

}
