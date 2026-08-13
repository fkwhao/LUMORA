package com.lumora.core.agent.model;

import com.lumora.core.conversation.domain.model.ChatMessage;
import com.lumora.core.mcp.domain.model.McpServerRuntimeConfiguration;
import com.lumora.core.memory.domain.model.MemoryContextItem;
import com.lumora.core.model.domain.model.ModelConnection;

import java.util.List;

/**
 * Transport-ready input for one streamed Python Agent request.
 */
public record AgentChatStreamRequest(
        List<ChatMessage> messages,
        ModelConnection connection,
        String correlationId,
        String reasoningEffort,
        String memorySummary,
        String workspacePath,
        String permissionMode,
        String taskId,
        String conversationSummary,
        List<MemoryContextItem> memoryCandidates,
        List<McpServerRuntimeConfiguration> mcpServers
) {
    public AgentChatStreamRequest {
        messages = messages == null ? List.of() : List.copyOf(messages);
        memoryCandidates = memoryCandidates == null
                ? List.of() : List.copyOf(memoryCandidates);
        mcpServers = mcpServers == null ? List.of() : List.copyOf(mcpServers);
    }
}
