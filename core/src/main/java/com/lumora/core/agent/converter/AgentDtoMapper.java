package com.lumora.core.agent.converter;

import com.lumora.core.agent.dto.request.AgentChatCompletionRequest;
import com.lumora.core.agent.dto.request.AgentChatMessageRequest;
import com.lumora.core.agent.dto.request.AgentChatToolCallRequest;
import com.lumora.core.agent.dto.request.AgentModelConnectionRequest;
import com.lumora.core.agent.dto.request.AgentMemoryContextRequest;
import com.lumora.core.agent.dto.request.AgentMcpServerRequest;
import com.lumora.core.agent.dto.request.AgentPromptContextRequest;
import com.lumora.core.agent.dto.response.AgentChatCompletionResponse;
import com.lumora.core.agent.dto.response.AgentContextCompactionResponse;
import com.lumora.core.agent.dto.response.AgentChatStreamEventResponse;
import com.lumora.core.agent.dto.response.AgentPlanStepResponse;
import com.lumora.core.agent.dto.response.AgentMemoryExtractionResponse;
import com.lumora.core.agent.dto.response.AgentPlanTaskResponse;
import com.lumora.core.agent.dto.response.AgentTokenUsageResponse;
import com.lumora.core.agent.exception.AgentRuntimeException;
import com.lumora.core.agent.model.AgentPlanStep;
import com.lumora.core.memory.domain.model.MemoryCandidate;
import com.lumora.core.memory.application.model.MemoryExtractionBatch;
import com.lumora.core.conversation.domain.model.ChatCompletion;
import com.lumora.core.conversation.domain.model.ChatMessage;
import com.lumora.core.conversation.domain.model.ChatStreamEvent;
import com.lumora.core.conversation.domain.model.ContextCompaction;
import com.lumora.core.model.domain.model.ModelConnection;
import com.lumora.core.memory.domain.model.MemoryContextItem;
import com.lumora.core.mcp.domain.model.McpServerRuntimeConfiguration;
import com.lumora.core.conversation.domain.model.TokenUsage;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 隔离 Python HTTP DTO 与 Java 内部领域模型。
 */
@Component
public class AgentDtoMapper {

    public List<AgentPlanStep> toPlanSteps(
            AgentPlanTaskResponse response
    ) {
        if (response == null || response.getSteps() == null) {
            throw new AgentRuntimeException("Python Agent 返回无效计划");
        }
        return response.getSteps().stream()
                .map(this::toPlanStep)
                .toList();
    }

    public AgentChatCompletionRequest toChatRequest(
            List<ChatMessage> messages,
            ModelConnection connection,
            String reasoningEffort
    ) {
        return toChatRequest(
                messages,
                connection,
                reasoningEffort,
                null
        );
    }

    public AgentChatCompletionRequest toChatRequest(
            List<ChatMessage> messages,
            ModelConnection connection,
            String reasoningEffort,
            String memorySummary
    ) {
        return toChatRequest(
                messages,
                connection,
                reasoningEffort,
                memorySummary,
                null
        );
    }

    public AgentChatCompletionRequest toChatRequest(
            List<ChatMessage> messages,
            ModelConnection connection,
            String reasoningEffort,
            String memorySummary,
            String workspacePath
    ) {
        return toChatRequest(
                messages,
                connection,
                reasoningEffort,
                memorySummary,
                workspacePath,
                "request_approval"
        );
    }

    public AgentChatCompletionRequest toChatRequest(
            List<ChatMessage> messages,
            ModelConnection connection,
            String reasoningEffort,
            String memorySummary,
            String workspacePath,
            String permissionMode
    ) {
        return toChatRequest(messages, connection, reasoningEffort,
                memorySummary, workspacePath, permissionMode, null, null);
    }

    public AgentChatCompletionRequest toChatRequest(
            List<ChatMessage> messages,
            ModelConnection connection,
            String reasoningEffort,
            String memorySummary,
            String workspacePath,
            String permissionMode,
            String taskId,
            String conversationSummary
    ) {
        return toChatRequest(messages, connection, reasoningEffort,
                memorySummary, workspacePath, permissionMode, taskId,
                conversationSummary, List.of());
    }

    public AgentChatCompletionRequest toChatRequest(
            List<ChatMessage> messages,
            ModelConnection connection,
            String reasoningEffort,
            String memorySummary,
            String workspacePath,
            String permissionMode,
            String taskId,
            String conversationSummary,
            List<MemoryContextItem> memoryCandidates
    ) {
        return toChatRequest(messages, connection, reasoningEffort,
                memorySummary, workspacePath, permissionMode, taskId,
                conversationSummary, memoryCandidates, List.of());
    }

    public AgentChatCompletionRequest toChatRequest(
            List<ChatMessage> messages,
            ModelConnection connection,
            String reasoningEffort,
            String memorySummary,
            String workspacePath,
            String permissionMode,
            String taskId,
            String conversationSummary,
            List<MemoryContextItem> memoryCandidates,
            List<McpServerRuntimeConfiguration> mcpServers
    ) {
        List<AgentChatMessageRequest> requestMessages = messages.stream()
                .map(message -> new AgentChatMessageRequest(
                        message.getRole(),
                        message.getContent(),
                        message.getMessageId(),
                        message.getSequence(),
                        message.getToolCalls().stream()
                                .map(call -> new AgentChatToolCallRequest(
                                        call.id(), call.name(), call.arguments()
                                ))
                                .toList(),
                        message.getToolCallId()
                ))
                .toList();
        return new AgentChatCompletionRequest(
                requestMessages,
                new AgentModelConnectionRequest(connection),
                AgentPromptContextRequest.forWorkspace(
                        memorySummary,
                        workspacePath,
                        permissionMode,
                        taskId,
                        conversationSummary,
                        memoryCandidates.stream()
                                .map(AgentMemoryContextRequest::new)
                                .toList(),
                        mcpServers.stream().map(AgentMcpServerRequest::new)
                                .toList()
                ),
                normalizeOptionalText(reasoningEffort)
        );
    }

    private String normalizeOptionalText(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    public ContextCompaction toContextCompaction(
            AgentContextCompactionResponse response
    ) {
        if (response == null || response.getUsage() == null) {
            throw new AgentRuntimeException("Python Agent 返回无效压缩结果");
        }
        return new ContextCompaction(
                response.getSummary(),
                response.getBeforeTokens(),
                response.getAfterTokens(),
                response.getThroughSequence(),
                response.getRetainedFromSequence(),
                toTokenUsage(response.getUsage())
        );
    }

    public ChatCompletion toChatCompletion(
            AgentChatCompletionResponse response
    ) {
        if (response == null || response.getUsage() == null) {
            throw new AgentRuntimeException("Python Agent 返回无效用量");
        }
        return new ChatCompletion(
                response.getMessage(),
                response.getModel(),
                toTokenUsage(response.getUsage())
        );
    }

    public List<MemoryCandidate> toMemoryCandidates(
            AgentMemoryExtractionResponse response
    ) {
        if (response == null || response.getCandidates() == null) {
            throw new AgentRuntimeException("Python Agent 返回无效记忆候选");
        }
        return response.getCandidates().stream()
                .map(candidate -> new MemoryCandidate(
                        candidate.getScope(),
                        candidate.getType(),
                        candidate.getRetention(),
                        candidate.getContent(),
                        candidate.getDedupeKey(),
                        candidate.getSubject(),
                        candidate.getPredicate(),
                        candidate.getValue(),
                        candidate.getTargetMemoryId(),
                        candidate.getStructuredData(),
                        candidate.getConfidence(),
                        candidate.getImportance(),
                        candidate.getTtlSeconds(),
                        candidate.getAction(),
                        candidate.getStorage()
                ))
                .toList();
    }

    public MemoryExtractionBatch toMemoryExtraction(
            AgentMemoryExtractionResponse response
    ) {
        if (response == null || response.getUsage() == null) {
            throw new AgentRuntimeException("Python Agent 返回无效记忆提取用量");
        }
        return new MemoryExtractionBatch(
                toMemoryCandidates(response),
                response.getModel(),
                toTokenUsage(response.getUsage())
        );
    }

    public ChatStreamEvent toChatStreamEvent(
            AgentChatStreamEventResponse response
    ) {
        AgentTokenUsageResponse usage = response.getUsage();
        return new ChatStreamEvent(
                response.getType(),
                response.getDelta(),
                response.getModel(),
                usage == null ? null : toTokenUsage(usage),
                response.getErrorMessage(),
                response.getItemId(),
                response.getToolCallId(),
                response.getToolName(),
                response.getTitle(),
                response.getArguments(),
                response.getOutput(),
                response.getDurationMs(),
                response.getExitCode(),
                response.getMetadata(),
                response.getApprovalId(),
                response.getPermissionLayer(),
                response.getReason(),
                response.getRiskLevel(),
                response.getReversible(),
                response.getDecision(),
                response.getActiveContextTokens()
        );
    }

    private AgentPlanStep toPlanStep(AgentPlanStepResponse response) {
        return new AgentPlanStep(
                response.getStepId(),
                response.getTitle(),
                response.getDescription(),
                response.isRequiresApproval()
        );
    }

    private TokenUsage toTokenUsage(AgentTokenUsageResponse response) {
        int inputTokens = response.getInputTokens();
        if (inputTokens == 0 && response.getPromptTokens() > 0
                && !response.isCacheMetricsAvailable()) {
            inputTokens = response.getPromptTokens();
        }
        int outputTokens = response.getOutputTokens();
        if (outputTokens == 0 && response.getCompletionTokens() > 0
                && response.getReasoningTokens() == 0) {
            outputTokens = response.getCompletionTokens();
        }
        return new TokenUsage(
                response.getPromptTokens(),
                response.getCompletionTokens(),
                response.getTotalTokens(),
                inputTokens,
                outputTokens,
                response.getReasoningTokens(),
                response.getCacheReadTokens(),
                response.getCacheWriteTokens(),
                response.isCacheMetricsAvailable()
        );
    }
}
