package com.lumora.core.task.api.controller;

import com.lumora.core.shared.api.constant.ApiPathConstants;
import com.lumora.core.task.api.dto.request.GitChangesRequest;
import com.lumora.core.task.api.dto.request.GitCheckoutRequest;
import com.lumora.core.task.api.dto.request.GitCreateBranchRequest;
import com.lumora.core.task.api.dto.request.RemoveGitWorktreeRequest;
import com.lumora.core.task.api.dto.request.WorkspaceInspectRequest;
import com.lumora.core.task.api.dto.response.GitBranchSummaryResponse;
import com.lumora.core.task.api.dto.response.GitHistoryResponse;
import com.lumora.core.task.api.dto.response.GitReviewChangesResponse;
import com.lumora.core.task.api.dto.response.WorkspaceContextResponse;
import com.lumora.core.task.api.dto.response.WorkspaceEnvironmentSummaryResponse;
import com.lumora.core.task.application.support.WorkspaceGitService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Whitelisted Workspace/Git REST contract consumed by Electron Main. */
@RestController
@Validated
@RequiredArgsConstructor
@RequestMapping(ApiPathConstants.API_PREFIX)
public class WorkspaceGitController {

    private final WorkspaceGitService workspaceGitService;

    @PostMapping(ApiPathConstants.WORKSPACE_INSPECT)
    public WorkspaceContextResponse inspect(
            @Valid @RequestBody WorkspaceInspectRequest request
    ) {
        return workspaceGitService.inspect(
                request.workspacePath(), request.taskId()
        );
    }

    @GetMapping("/tasks" + ApiPathConstants.TASK_GIT_BRANCHES)
    public List<GitBranchSummaryResponse> branches(
            @PathVariable String taskId
    ) {
        return workspaceGitService.branches(taskId);
    }

    @PostMapping("/tasks" + ApiPathConstants.TASK_GIT_CHECKOUT)
    public WorkspaceContextResponse checkout(
            @PathVariable String taskId,
            @Valid @RequestBody GitCheckoutRequest request
    ) {
        return workspaceGitService.checkout(taskId, request);
    }

    @PostMapping("/tasks" + ApiPathConstants.TASK_GIT_BRANCHES)
    public WorkspaceContextResponse createBranch(
            @PathVariable String taskId,
            @Valid @RequestBody GitCreateBranchRequest request
    ) {
        return workspaceGitService.createBranch(taskId, request);
    }

    @GetMapping("/tasks" + ApiPathConstants.TASK_GIT_HISTORY)
    public GitHistoryResponse history(
            @PathVariable String taskId,
            @RequestParam(required = false)
            @Min(value = 1, message = "limit 不能小于 1")
            @Max(value = 200, message = "limit 不能超过 200")
            Integer limit,
            @RequestParam(required = false)
            @Size(max = 512, message = "cursor 不能超过 512 个字符")
            String cursor
    ) {
        return workspaceGitService.history(taskId, limit, cursor);
    }

    @PostMapping("/tasks" + ApiPathConstants.TASK_GIT_CHANGES)
    public GitReviewChangesResponse changes(
            @PathVariable String taskId,
            @Valid @RequestBody GitChangesRequest request
    ) {
        return workspaceGitService.changes(taskId, request);
    }

    @GetMapping("/tasks" + ApiPathConstants.TASK_GIT_WORKTREES)
    public List<WorkspaceEnvironmentSummaryResponse> worktrees(
            @PathVariable String taskId
    ) {
        return workspaceGitService.worktrees(taskId);
    }

    @DeleteMapping("/tasks" + ApiPathConstants.TASK_GIT_WORKTREES)
    public List<WorkspaceEnvironmentSummaryResponse> removeWorktree(
            @PathVariable String taskId,
            @Valid @RequestBody RemoveGitWorktreeRequest request
    ) {
        return workspaceGitService.removeWorktree(
                taskId, request.worktreePath()
        );
    }

    @PostMapping("/tasks" + ApiPathConstants.TASK_GIT_WORKTREES_PRUNE)
    public List<WorkspaceEnvironmentSummaryResponse> pruneWorktrees(
            @PathVariable String taskId
    ) {
        return workspaceGitService.pruneWorktrees(taskId);
    }
}
