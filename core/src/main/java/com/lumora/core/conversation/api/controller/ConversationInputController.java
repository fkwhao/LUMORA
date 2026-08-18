package com.lumora.core.conversation.api.controller;

import com.lumora.core.conversation.api.dto.request.CreateConversationInputRequest;
import com.lumora.core.conversation.api.dto.request.UpdateConversationInputRequest;
import com.lumora.core.conversation.api.dto.response.ConversationInputResponse;
import com.lumora.core.conversation.application.service.ConversationRunCoordinator;
import com.lumora.core.shared.api.constant.ApiPathConstants;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping(ApiPathConstants.TASKS)
public class ConversationInputController {

    private final ConversationRunCoordinator runCoordinator;

    @GetMapping(ApiPathConstants.TASK_INPUTS)
    public List<ConversationInputResponse> list(@PathVariable String taskId) {
        return runCoordinator.listInputs(taskId).stream()
                .map(ConversationInputResponse::from).toList();
    }

    @PostMapping(ApiPathConstants.TASK_INPUTS)
    @ResponseStatus(HttpStatus.CREATED)
    public ConversationInputResponse create(
            @PathVariable String taskId,
            @Valid @RequestBody CreateConversationInputRequest request
    ) {
        return ConversationInputResponse.from(runCoordinator.enqueueInput(
                taskId, request.content(), request.attachments(),
                request.target(), request.model(),
                request.reasoningEffort(), request.workspacePath(),
                request.permissionMode(), request.position()
        ));
    }

    @PutMapping(ApiPathConstants.TASK_INPUT)
    public ConversationInputResponse update(
            @PathVariable String taskId,
            @PathVariable String inputId,
            @Valid @RequestBody UpdateConversationInputRequest request
    ) {
        return ConversationInputResponse.from(runCoordinator.updateInput(
                taskId, inputId, request.content(), request.attachments(),
                request.target(),
                request.model(), request.reasoningEffort(),
                request.workspacePath(), request.permissionMode(),
                request.position()
        ));
    }

    @DeleteMapping(ApiPathConstants.TASK_INPUT)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(
            @PathVariable String taskId,
            @PathVariable String inputId
    ) {
        runCoordinator.deleteInput(taskId, inputId);
    }
}
