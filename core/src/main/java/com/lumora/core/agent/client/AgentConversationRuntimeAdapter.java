package com.lumora.core.agent.client;

import com.lumora.core.agent.model.AgentChatStreamRequest;
import com.lumora.core.conversation.application.model.ConversationRunRequest;
import com.lumora.core.conversation.application.port.ContextCompactionPort;
import com.lumora.core.conversation.application.port.ConversationRuntimePort;
import com.lumora.core.conversation.application.port.ToolApprovalPort;
import com.lumora.core.conversation.application.support.AgentSessionStore;
import com.lumora.core.conversation.application.support.AgentWorkflowStore;
import com.lumora.core.conversation.domain.model.ChatCompletion;
import com.lumora.core.conversation.domain.model.ChatMessage;
import com.lumora.core.conversation.domain.model.ChatStreamEvent;
import com.lumora.core.conversation.domain.model.ContextCompaction;
import com.lumora.core.model.application.port.ModelConnectionResolver;
import com.lumora.core.mcp.application.service.McpService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.function.Consumer;

/**
 * Conversation-facing adapter for the Python Agent runtime.
 */
@Component
@RequiredArgsConstructor
public class AgentConversationRuntimeAdapter implements ConversationRuntimePort,
    ContextCompactionPort, ToolApprovalPort {

    private final AgentRuntimeClient agentRuntimeClient;
    private final ModelConnectionResolver connectionResolver;
    private final McpService mcpService;
    private final AgentSessionStore agentSessionStore;
    private final AgentWorkflowStore agentWorkflowStore;

    @Override
    public ChatCompletion completeChat(List<ChatMessage> messages,
                                       String correlationId) {
        if (messages == null || messages.isEmpty()) {
            throw new IllegalArgumentException("Conversation messages cannot be empty");
        }
        return agentRuntimeClient.completeChat(
            List.copyOf(messages),
            connectionResolver.resolve(null),
            requireText(correlationId, "Correlation ID")
        );
    }

    @Override
    public ContextCompaction compactContext(List<ChatMessage> messages,
                                            String memorySummary, String taskId, String conversationSummary,
                                            String model, String correlationId) {
        if (messages == null || messages.isEmpty()) {
            throw new IllegalArgumentException("No conversation messages to compact");
        }
        return agentRuntimeClient.compactChat(
            List.copyOf(messages),
            connectionResolver.resolve(model),
            memorySummary,
            requireText(taskId, "Task ID"),
            conversationSummary,
            requireText(correlationId, "Correlation ID")
        );
    }

    @Override
    public void streamChat(ConversationRunRequest request,
                           Consumer<ChatStreamEvent> eventConsumer) {
        if (request == null || request.messages().isEmpty()) {
            throw new IllegalArgumentException("Conversation messages cannot be empty");
        }
        agentRuntimeClient.streamChat(
            new AgentChatStreamRequest(
                request.messages(),
                connectionResolver.resolve(request.model()),
                requireText(request.correlationId(), "Correlation ID"),
                request.reasoningEffort(),
                request.memorySummary(),
                request.workspacePath(),
                request.permissionMode(),
                request.taskId(),
                request.conversationSummary(),
                request.memoryCandidates(),
                mcpService.listEnabledServers(),
                agentSessionStore.listSnapshots(request.taskId()),
                agentWorkflowStore.listSnapshots(request.taskId())
            ),
            eventConsumer
        );
    }

    @Override
    public void decideToolApproval(String approvalId, String decision,
                                   String correlationId) {
        agentRuntimeClient.decideToolApproval(
            requireText(approvalId, "Approval ID"),
            requireText(decision, "Approval decision"),
            requireText(correlationId, "Correlation ID")
        );
    }

    @Override
    public boolean pauseChat(String runId, String correlationId) {
        return agentRuntimeClient.pauseRun(
                requireText(runId, "Run ID"),
                requireText(correlationId, "Correlation ID")
        );
    }

    @Override
    public boolean addSteer(
            String runId, String inputId, String content, String correlationId
    ) {
        return agentRuntimeClient.addSteer(
                requireText(runId, "Run ID"),
                requireText(inputId, "Input ID"),
                requireText(content, "Steer content"),
                requireText(correlationId, "Correlation ID")
        );
    }

    @Override
    public boolean replaceSteer(
            String runId, String inputId, String content, String correlationId
    ) {
        return agentRuntimeClient.replaceSteer(
                requireText(runId, "Run ID"),
                requireText(inputId, "Input ID"),
                requireText(content, "Steer content"),
                requireText(correlationId, "Correlation ID")
        );
    }

    @Override
    public boolean removeSteer(
            String runId, String inputId, String correlationId
    ) {
        return agentRuntimeClient.removeSteer(
                requireText(runId, "Run ID"),
                requireText(inputId, "Input ID"),
                requireText(correlationId, "Correlation ID")
        );
    }

    private static String requireText(String value, String label) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(label + " cannot be empty");
        }
        return value.trim();
    }
}
