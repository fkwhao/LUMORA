package com.lumora.core.conversation.api.controller;

import com.lumora.core.conversation.api.converter.ConversationMessageResponseConverter;
import com.lumora.core.approval.api.dto.request.ToolApprovalDecisionRequest;
import com.lumora.core.conversation.api.dto.request.SendMessageRequest;
import com.lumora.core.conversation.api.dto.response.ConversationMessageResponse;
import com.lumora.core.conversation.api.dto.response.ContextCompactionResponse;
import com.lumora.core.conversation.application.service.ArtifactService;
import com.lumora.core.conversation.application.service.ConversationRunCoordinator;
import com.lumora.core.conversation.application.service.ConversationService;
import com.lumora.core.conversation.application.support.ConversationRunEventStreamRegistry;
import com.lumora.core.conversation.domain.entity.ConversationRun;
import com.lumora.core.conversation.domain.model.ArtifactChunk;
import com.lumora.core.shared.api.constant.ApiPathConstants;
import com.lumora.core.shared.api.constant.HttpContractConstants;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;

/**
 * 会话 REST/SSE 入口。
 *
 * <p>Controller 只负责协议转换；生成流程、并发控制和持久化均由 Service 处理。</p>
 */
@RestController
@RequiredArgsConstructor
@RequestMapping(ApiPathConstants.TASKS)
public class ConversationController {

    private final ConversationService conversationService;
    private final ConversationRunCoordinator runCoordinator;
    private final ConversationRunEventStreamRegistry runEventStreams;
    private final ConversationMessageResponseConverter responseConverter;
    private final ArtifactService artifactService;

    @GetMapping(ApiPathConstants.TASK_MESSAGES)
    public List<ConversationMessageResponse> listMessages(
            @PathVariable String taskId
    ) {
        return conversationService.listMessages(taskId).stream()
                .map(responseConverter::fromEntity)
                .toList();
    }

    @PostMapping(ApiPathConstants.TASK_MESSAGE_BRANCH)
    public java.util.Map<String, Boolean> activateMessageBranch(
            @PathVariable String taskId,
            @PathVariable String messageId
    ) {
        conversationService.activateBranch(taskId, messageId);
        return java.util.Map.of("activated", true);
    }

    @PostMapping(
            value = ApiPathConstants.TASK_MESSAGE_STREAM,
            produces = MediaType.TEXT_EVENT_STREAM_VALUE
    )
    public SseEmitter streamMessage(
            @PathVariable String taskId,
            @Valid @RequestBody SendMessageRequest request,
            @RequestHeader(HttpContractConstants.CORRELATION_ID_HEADER)
            String correlationId
    ) {
        ConversationRun run = runCoordinator.startMessage(
                taskId,
                request.getContent(),
                request.getAttachments(),
                request.getModel(),
                request.getReasoningEffort(),
                request.getWorkspacePath(),
                request.getPermissionMode(),
                correlationId
        );
        return runEventStreams.subscribeRaw(run.getRunId(), 0L);
    }

    @PostMapping(
            value = ApiPathConstants.TASK_MESSAGE_REGENERATE,
            produces = MediaType.TEXT_EVENT_STREAM_VALUE
    )
    public SseEmitter regenerateMessage(
            @PathVariable String taskId,
            @PathVariable String messageId,
            @Valid @RequestBody SendMessageRequest request,
            @RequestHeader(HttpContractConstants.CORRELATION_ID_HEADER)
            String correlationId
    ) {
        ConversationRun run = runCoordinator.startRegeneration(
                taskId,
                messageId,
                request.getContent(),
                request.getAttachments(),
                request.getModel(),
                request.getReasoningEffort(),
                request.getWorkspacePath(),
                request.getPermissionMode(),
                correlationId
        );
        return runEventStreams.subscribeRaw(run.getRunId(), 0L);
    }

    @DeleteMapping(ApiPathConstants.TASK_MESSAGE_CANCEL)
    public Map<String, Boolean> cancelGeneration(
            @PathVariable String taskId
    ) {
        return Map.of("cancelled", runCoordinator.cancelActive(taskId) != null);
    }

    @PostMapping(ApiPathConstants.TASK_TOOL_APPROVAL)
    public Map<String, Boolean> decideToolApproval(
            @PathVariable String taskId,
            @PathVariable String approvalId,
            @Valid @RequestBody ToolApprovalDecisionRequest request
    ) {
        conversationService.decideToolApproval(
                taskId,
                approvalId,
                request.getDecision()
        );
        return Map.of("accepted", true);
    }

    @GetMapping(ApiPathConstants.TASK_ARTIFACT)
    public ArtifactChunk readArtifact(
            @PathVariable String taskId,
            @PathVariable String artifactId,
            @org.springframework.web.bind.annotation.RequestParam(defaultValue = "0")
            long offset,
            @org.springframework.web.bind.annotation.RequestParam(defaultValue = "20000")
            int limit
    ) {
        return artifactService.read(taskId, artifactId, offset, limit);
    }

    @PostMapping(ApiPathConstants.TASK_CONTEXT_COMPACT)
    public ContextCompactionResponse compactContext(
            @PathVariable String taskId,
            @RequestBody(required = false) Map<String, String> request,
            @RequestHeader(HttpContractConstants.CORRELATION_ID_HEADER)
            String correlationId
    ) {
        String model = request == null ? null : request.get("model");
        return ContextCompactionResponse.from(
                conversationService.compactContext(taskId, model, correlationId)
        );
    }

}
