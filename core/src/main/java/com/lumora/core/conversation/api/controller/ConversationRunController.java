package com.lumora.core.conversation.api.controller;

import com.lumora.core.conversation.api.dto.response.ConversationRunResponse;
import com.lumora.core.conversation.api.dto.response.ConversationRunChangesResponse;
import com.lumora.core.conversation.application.service.ConversationRunCoordinator;
import com.lumora.core.conversation.application.support.ConversationRunEventStreamRegistry;
import com.lumora.core.conversation.domain.entity.ConversationRun;
import com.lumora.core.shared.api.constant.ApiPathConstants;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequiredArgsConstructor
@RequestMapping(ApiPathConstants.TASKS)
public class ConversationRunController {

    private final ConversationRunCoordinator runCoordinator;
    private final ConversationRunEventStreamRegistry eventStreams;

    @GetMapping(ApiPathConstants.TASK_ACTIVE_RUN)
    public ResponseEntity<ConversationRunResponse> active(
            @PathVariable String taskId
    ) {
        ConversationRun run = runCoordinator.findActive(taskId);
        return run == null
                ? ResponseEntity.noContent().build()
                : ResponseEntity.ok(ConversationRunResponse.from(run));
    }

    @GetMapping(ApiPathConstants.TASK_RUN)
    public ConversationRunResponse get(
            @PathVariable String taskId,
            @PathVariable String runId
    ) {
        return ConversationRunResponse.from(
                runCoordinator.get(taskId, runId)
        );
    }

    @GetMapping(ApiPathConstants.TASK_RUN_CHANGES)
    public ConversationRunChangesResponse changes(
            @PathVariable String taskId,
            @PathVariable String runId
    ) {
        return runCoordinator.changes(taskId, runId);
    }

    @PostMapping(ApiPathConstants.TASK_RUN_REVERT)
    public ConversationRunChangesResponse revert(
            @PathVariable String taskId,
            @PathVariable String runId
    ) {
        return runCoordinator.revert(taskId, runId);
    }

    @GetMapping(
            value = ApiPathConstants.TASK_RUN_EVENTS,
            produces = MediaType.TEXT_EVENT_STREAM_VALUE
    )
    public SseEmitter events(
            @PathVariable String taskId,
            @PathVariable String runId,
            @RequestParam(defaultValue = "0") long afterSequence
    ) {
        runCoordinator.get(taskId, runId);
        return eventStreams.subscribeEnvelope(runId, afterSequence);
    }

    @PostMapping(ApiPathConstants.TASK_RUN_PAUSE)
    public ConversationRunResponse pause(
            @PathVariable String taskId,
            @PathVariable String runId
    ) {
        return ConversationRunResponse.from(
                runCoordinator.pause(taskId, runId)
        );
    }

    @PostMapping(ApiPathConstants.TASK_ACTIVE_RUN_PAUSE)
    public ResponseEntity<ConversationRunResponse> pauseActive(
            @PathVariable String taskId
    ) {
        ConversationRun run = runCoordinator.pauseActive(taskId);
        return run == null
                ? ResponseEntity.noContent().build()
                : ResponseEntity.ok(ConversationRunResponse.from(run));
    }

    @PostMapping(ApiPathConstants.TASK_RUN_RESUME)
    public ConversationRunResponse resume(
            @PathVariable String taskId,
            @PathVariable String runId
    ) {
        return ConversationRunResponse.from(
                runCoordinator.resume(taskId, runId)
        );
    }

    @PostMapping(ApiPathConstants.TASK_RUN_CANCEL)
    public ConversationRunResponse cancel(
            @PathVariable String taskId,
            @PathVariable String runId
    ) {
        return ConversationRunResponse.from(
                runCoordinator.cancel(taskId, runId)
        );
    }
}
