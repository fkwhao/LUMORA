package com.lumora.core.task.api.controller;

import com.lumora.core.shared.api.constant.ApiPathConstants;
import com.lumora.core.task.api.dto.request.CreateWorktreeBranchRequest;
import com.lumora.core.task.api.dto.response.TaskWorktreeChangesResponse;
import com.lumora.core.task.api.dto.response.TaskWorktreeResponse;
import com.lumora.core.task.application.service.TaskService;
import com.lumora.core.task.application.support.TaskWorktreeChangeService;
import com.lumora.core.task.application.support.TaskWorktreeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping(ApiPathConstants.TASKS)
public class TaskWorktreeController {

    private final TaskService taskService;
    private final TaskWorktreeService worktreeService;
    private final TaskWorktreeChangeService worktreeChangeService;

    @GetMapping(ApiPathConstants.TASK_WORKTREE)
    public ResponseEntity<TaskWorktreeResponse> status(
            @PathVariable String taskId
    ) {
        taskService.getTask(taskId);
        TaskWorktreeResponse response = worktreeService.status(taskId);
        return response == null
                ? ResponseEntity.noContent().build()
                : ResponseEntity.ok(response);
    }

    @GetMapping(ApiPathConstants.TASK_WORKTREE_CHANGES)
    public ResponseEntity<TaskWorktreeChangesResponse> changes(
            @PathVariable String taskId
    ) {
        taskService.getTask(taskId);
        TaskWorktreeChangesResponse response = worktreeChangeService.changes(
                taskId
        );
        return response == null
                ? ResponseEntity.noContent().build()
                : ResponseEntity.ok(response);
    }

    @PostMapping(ApiPathConstants.TASK_WORKTREE_APPLY)
    public TaskWorktreeResponse apply(@PathVariable String taskId) {
        taskService.getTask(taskId);
        return worktreeService.apply(taskId);
    }

    @PostMapping(ApiPathConstants.TASK_WORKTREE_BRANCH)
    public TaskWorktreeResponse createBranch(
            @PathVariable String taskId,
            @Valid @RequestBody CreateWorktreeBranchRequest request
    ) {
        taskService.getTask(taskId);
        return worktreeService.createBranch(taskId, request.getBranchName());
    }

    @PostMapping(ApiPathConstants.TASK_WORKTREE_DISCARD)
    public TaskWorktreeResponse discard(@PathVariable String taskId) {
        taskService.getTask(taskId);
        return worktreeService.discard(taskId);
    }
}
