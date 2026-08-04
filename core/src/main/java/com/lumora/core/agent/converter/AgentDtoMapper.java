package com.lumora.core.agent.converter;

import com.lumora.core.agent.dto.request.AgentChatCompletionRequest;
import com.lumora.core.agent.dto.request.AgentChatMessageRequest;
import com.lumora.core.agent.dto.request.AgentModelConnectionRequest;
import com.lumora.core.agent.dto.request.AgentPromptContextRequest;
import com.lumora.core.agent.dto.response.AgentChatCompletionResponse;
import com.lumora.core.agent.dto.response.AgentChatStreamEventResponse;
import com.lumora.core.agent.dto.response.AgentPlanStepResponse;
import com.lumora.core.agent.dto.response.AgentMemoryExtractionResponse;
import com.lumora.core.agent.dto.response.AgentPlanTaskResponse;
import com.lumora.core.agent.dto.response.AgentTokenUsageResponse;
import com.lumora.core.agent.exception.AgentRuntimeException;
import com.lumora.core.agent.model.AgentPlanStep;
import com.lumora.core.agent.model.AgentMemoryCandidate;
import com.lumora.core.model.ChatCompletion;
import com.lumora.core.model.ChatMessage;
import com.lumora.core.model.ChatStreamEvent;
import com.lumora.core.model.ModelConnection;
import com.lumora.core.model.TokenUsage;
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
        List<AgentChatMessageRequest> requestMessages = messages.stream()
                .map(message -> new AgentChatMessageRequest(
                        message.getRole(),
                        message.getContent()
                ))
                .toList();
        return new AgentChatCompletionRequest(
                requestMessages,
                new AgentModelConnectionRequest(connection),
                AgentPromptContextRequest.forWorkspace(
                        memorySummary,
                        workspacePath
                ),
                reasoningEffort
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

    public List<AgentMemoryCandidate> toMemoryCandidates(
            AgentMemoryExtractionResponse response
    ) {
        if (response == null || response.getCandidates() == null) {
            throw new AgentRuntimeException("Python Agent 返回无效记忆候选");
        }
        return response.getCandidates().stream()
                .map(candidate -> new AgentMemoryCandidate(
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
                        candidate.getTtlSeconds()
                ))
                .toList();
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
                response.getMetadata()
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
        return new TokenUsage(
                response.getPromptTokens(),
                response.getCompletionTokens(),
                response.getTotalTokens()
        );
    }
}
