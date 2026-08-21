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

    private final String workspacePath;
    private final List<String> projectInstructions;
    private final List<String> availableTools;
    private final String memorySummary;
    private final List<AgentMemoryContextRequest> memoryCandidates;
    private final String permissionMode;
    private final String taskId;
    private final String conversationSummary;
    private final List<AgentMcpServerRequest> mcpServers;
    private final List<AgentSessionSnapshotRequest> agentSessions;
    private final List<Map<String, Object>> workflowSnapshots;
    private final AgentExecutionBudgetRequest executionBudget;

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
        this(workspacePath, projectInstructions, availableTools,
                memorySummary, permissionMode, taskId, conversationSummary,
                List.of());
    }

    public AgentPromptContextRequest(
            String workspacePath,
            List<String> projectInstructions,
            List<String> availableTools,
            String memorySummary,
            String permissionMode,
            String taskId,
            String conversationSummary,
            List<AgentMemoryContextRequest> memoryCandidates
    ) {
        this(workspacePath, projectInstructions, availableTools,
                memorySummary, permissionMode, taskId, conversationSummary,
                memoryCandidates, List.of());
    }

    public AgentPromptContextRequest(
            String workspacePath,
            List<String> projectInstructions,
            List<String> availableTools,
            String memorySummary,
            String permissionMode,
            String taskId,
            String conversationSummary,
            List<AgentMemoryContextRequest> memoryCandidates,
            List<AgentMcpServerRequest> mcpServers
    ) {
        this(workspacePath, projectInstructions, availableTools,
                memorySummary, permissionMode, taskId, conversationSummary,
                memoryCandidates, mcpServers, List.of());
    }

    public AgentPromptContextRequest(
            String workspacePath,
            List<String> projectInstructions,
            List<String> availableTools,
            String memorySummary,
            String permissionMode,
            String taskId,
            String conversationSummary,
            List<AgentMemoryContextRequest> memoryCandidates,
            List<AgentMcpServerRequest> mcpServers,
            List<AgentSessionSnapshotRequest> agentSessions
    ) {
        this(
                workspacePath,
                projectInstructions,
                availableTools,
                memorySummary,
                permissionMode,
                taskId,
                conversationSummary,
                memoryCandidates,
                mcpServers,
                agentSessions,
                AgentExecutionBudgetRequest.defaults()
        );
    }

    public AgentPromptContextRequest(
            String workspacePath,
            List<String> projectInstructions,
            List<String> availableTools,
            String memorySummary,
            String permissionMode,
            String taskId,
            String conversationSummary,
            List<AgentMemoryContextRequest> memoryCandidates,
            List<AgentMcpServerRequest> mcpServers,
            List<AgentSessionSnapshotRequest> agentSessions,
            AgentExecutionBudgetRequest executionBudget
    ) {
        this(workspacePath, projectInstructions, availableTools, memorySummary,
                permissionMode, taskId, conversationSummary, memoryCandidates,
                mcpServers, agentSessions, executionBudget, List.of());
    }

    public AgentPromptContextRequest(
            String workspacePath,
            List<String> projectInstructions,
            List<String> availableTools,
            String memorySummary,
            String permissionMode,
            String taskId,
            String conversationSummary,
            List<AgentMemoryContextRequest> memoryCandidates,
            List<AgentMcpServerRequest> mcpServers,
            List<AgentSessionSnapshotRequest> agentSessions,
            AgentExecutionBudgetRequest executionBudget,
            List<Map<String, Object>> workflowSnapshots
    ) {
        this.workspacePath = workspacePath;
        this.projectInstructions = List.copyOf(projectInstructions);
        this.availableTools = List.copyOf(availableTools);
        this.memorySummary = memorySummary;
        this.memoryCandidates = List.copyOf(memoryCandidates);
        this.permissionMode = normalizePermissionMode(permissionMode);
        this.taskId = taskId;
        this.conversationSummary = conversationSummary;
        this.mcpServers = List.copyOf(mcpServers);
        this.agentSessions = List.copyOf(agentSessions);
        this.workflowSnapshots = workflowSnapshots == null
                ? List.of() : List.copyOf(workflowSnapshots);
        this.executionBudget = executionBudget == null
                ? AgentExecutionBudgetRequest.defaults()
                : executionBudget;
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
                // 空列表表示采用 Agent ToolRegistry 的工作区默认工具集；
                // 非空列表仅用于显式收窄，避免 Java 与 Python 重复维护工具名。
                List.of(),
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
        return forWorkspace(memorySummary, workspacePath, permissionMode,
                taskId, conversationSummary, List.of());
    }

    public static AgentPromptContextRequest forWorkspace(
            String memorySummary,
            String workspacePath,
            String permissionMode,
            String taskId,
            String conversationSummary,
            List<AgentMemoryContextRequest> memoryCandidates
    ) {
        return forWorkspace(memorySummary, workspacePath, permissionMode,
                taskId, conversationSummary, memoryCandidates, List.of());
    }

    public static AgentPromptContextRequest forWorkspace(
            String memorySummary,
            String workspacePath,
            String permissionMode,
            String taskId,
            String conversationSummary,
            List<AgentMemoryContextRequest> memoryCandidates,
            List<AgentMcpServerRequest> mcpServers
    ) {
        return forWorkspace(memorySummary, workspacePath, permissionMode,
                taskId, conversationSummary, memoryCandidates, mcpServers,
                List.of());
    }

    public static AgentPromptContextRequest forWorkspace(
            String memorySummary,
            String workspacePath,
            String permissionMode,
            String taskId,
            String conversationSummary,
            List<AgentMemoryContextRequest> memoryCandidates,
            List<AgentMcpServerRequest> mcpServers,
            List<AgentSessionSnapshotRequest> agentSessions
    ) {
        return forWorkspace(memorySummary, workspacePath, permissionMode,
                taskId, conversationSummary, memoryCandidates, mcpServers,
                agentSessions, List.of());
    }

    public static AgentPromptContextRequest forWorkspace(
            String memorySummary,
            String workspacePath,
            String permissionMode,
            String taskId,
            String conversationSummary,
            List<AgentMemoryContextRequest> memoryCandidates,
            List<AgentMcpServerRequest> mcpServers,
            List<AgentSessionSnapshotRequest> agentSessions,
            List<Map<String, Object>> workflowSnapshots
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
                conversationSummary,
                memoryCandidates,
                mcpServers,
                agentSessions,
                AgentExecutionBudgetRequest.defaults(),
                workflowSnapshots
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

    public List<AgentMemoryContextRequest> getMemoryCandidates() {
        return memoryCandidates;
    }

    public String getPermissionMode() {
        return permissionMode;
    }

    public String getTaskId() { return taskId; }

    public String getConversationSummary() { return conversationSummary; }

    public List<AgentMcpServerRequest> getMcpServers() { return mcpServers; }

    public List<AgentSessionSnapshotRequest> getAgentSessions() {
        return agentSessions;
    }

    public List<Map<String, Object>> getWorkflowSnapshots() {
        return workflowSnapshots;
    }

    public AgentExecutionBudgetRequest getExecutionBudget() {
        return executionBudget;
    }

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
