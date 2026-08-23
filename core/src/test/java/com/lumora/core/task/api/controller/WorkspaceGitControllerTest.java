package com.lumora.core.task.api.controller;

import com.lumora.core.shared.api.advice.RestExceptionHandler;
import com.lumora.core.shared.infrastructure.git.GitWorkspaceMutationGate;
import com.lumora.core.task.api.dto.request.GitChangesRequest;
import com.lumora.core.task.api.dto.response.GitHistoryResponse;
import com.lumora.core.task.api.dto.response.GitReviewChangesResponse;
import com.lumora.core.task.api.dto.response.WorkspaceContextResponse;
import com.lumora.core.task.api.dto.response.WorkspaceEnvironmentSummaryResponse;
import com.lumora.core.task.api.dto.response.WorkspaceGitStatusResponse;
import com.lumora.core.task.application.service.TaskService;
import com.lumora.core.task.application.support.TaskWorktreeChangeService;
import com.lumora.core.task.application.support.TaskWorktreeService;
import com.lumora.core.task.application.support.WorkspaceGitService;
import com.lumora.core.task.domain.entity.AgentTask;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class WorkspaceGitControllerTest {

    @Test
    void exposesEveryWorkspaceGitRouteUsedByElectron() throws Exception {
        WorkspaceGitService service = mock(WorkspaceGitService.class);
        when(service.inspect("F:/project", null)).thenReturn(context());
        when(service.branches("task-1")).thenReturn(List.of());
        when(service.checkout(
                org.mockito.ArgumentMatchers.eq("task-1"),
                org.mockito.ArgumentMatchers.any()
        )).thenReturn(context());
        when(service.createBranch(
                org.mockito.ArgumentMatchers.eq("task-1"),
                org.mockito.ArgumentMatchers.any()
        )).thenReturn(context());
        when(service.history("task-1", 30, null)).thenReturn(
                new GitHistoryResponse(List.of(), null)
        );
        when(service.worktrees("task-1")).thenReturn(List.of());
        when(service.removeWorktree("task-1", "F:/linked"))
                .thenReturn(List.of());
        when(service.pruneWorktrees("task-1")).thenReturn(List.of());
        MockMvc mvc = standaloneSetup(new WorkspaceGitController(service))
                .setControllerAdvice(new RestExceptionHandler())
                .build();

        mvc.perform(post("/api/v1/workspaces/inspect")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"workspacePath":"F:/project"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.effectiveWorkspacePath")
                        .value("F:/project"));
        mvc.perform(get("/api/v1/tasks/task-1/git/branches"))
                .andExpect(status().isOk());
        mvc.perform(post("/api/v1/tasks/task-1/git/checkout")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"branchName":"feature/test"}
                                """))
                .andExpect(status().isOk());
        mvc.perform(post("/api/v1/tasks/task-1/git/branches")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"branchName":"feature/new","checkout":true}
                                """))
                .andExpect(status().isOk());
        mvc.perform(get("/api/v1/tasks/task-1/git/history")
                        .queryParam("limit", "30"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.commits").isArray());
        mvc.perform(get("/api/v1/tasks/task-1/git/worktrees"))
                .andExpect(status().isOk());
        mvc.perform(delete("/api/v1/tasks/task-1/git/worktrees")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"worktreePath":"F:/linked"}
                                """))
                .andExpect(status().isOk());
        mvc.perform(post("/api/v1/tasks/task-1/git/worktrees/prune"))
                .andExpect(status().isOk());
    }

    @Test
    void acceptsTheFlatScopeBodyUsedByElectron() throws Exception {
        WorkspaceGitService service = mock(WorkspaceGitService.class);
        when(service.changes(
                org.mockito.ArgumentMatchers.eq("task-1"),
                org.mockito.ArgumentMatchers.any(GitChangesRequest.class)
        )).thenReturn(new GitReviewChangesResponse(
                "BRANCH_COMPARE", null, null, "main", "feature",
                "main → feature", "F:/project", "", 2, 1,
                List.of(), Instant.parse("2026-08-23T00:00:00Z")
        ));
        MockMvc mvc = standaloneSetup(new WorkspaceGitController(service))
                .setControllerAdvice(new RestExceptionHandler())
                .build();

        mvc.perform(post("/api/v1/tasks/task-1/git/changes")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "scope": "BRANCH_COMPARE",
                                  "baseRef": "main",
                                  "headRef": "feature"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scope").value("BRANCH_COMPARE"))
                .andExpect(jsonPath("$.baseRef").value("main"))
                .andExpect(jsonPath("$.headRef").value("feature"))
                .andExpect(jsonPath("$.additions").value(2));

        ArgumentCaptor<GitChangesRequest> request = ArgumentCaptor.forClass(
                GitChangesRequest.class
        );
        verify(service).changes(
                org.mockito.ArgumentMatchers.eq("task-1"), request.capture()
        );
        assertThat(request.getValue().scope()).isEqualTo("BRANCH_COMPARE");
    }

    @Test
    void handoffAndSettingsReturnTheCompleteWorkspaceContext()
            throws Exception {
        TaskService taskService = mock(TaskService.class);
        TaskWorktreeService worktrees = mock(TaskWorktreeService.class);
        TaskWorktreeChangeService changes = mock(
                TaskWorktreeChangeService.class
        );
        WorkspaceGitService workspaceGit = mock(WorkspaceGitService.class);
        AgentTask task = new AgentTask();
        task.setTaskId("task-1");
        task.setWorkspacePath("F:/project");
        when(taskService.getTask("task-1")).thenReturn(task);
        when(workspaceGit.contextForTask("task-1")).thenReturn(context());
        MockMvc mvc = standaloneSetup(new TaskWorktreeController(
                taskService, worktrees, changes, workspaceGit,
                new GitWorkspaceMutationGate()
        ))
                .setControllerAdvice(new RestExceptionHandler())
                .build();

        mvc.perform(post("/api/v1/tasks/task-1/workspace/handoff")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "target": "LOCAL",
                                  "expectedRevision": 7
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.workspaceRevision").value(7))
                .andExpect(jsonPath("$.environment.mode").value("LOCAL"))
                .andExpect(jsonPath("$.environment.managedByLumora")
                        .value(false))
                .andExpect(jsonPath("$.environment.canAutoApply")
                        .value(false));
        verify(workspaceGit).assertExpectedRevision("task-1", 7L);
        verify(worktrees).handoff(
                "task-1", "F:/project", "LOCAL", null
        );

        mvc.perform(put(
                        "/api/v1/tasks/task-1/workspace/worktree-settings"
                )
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "autoApplyWhenClean": true,
                                  "expectedSettingsRevision": 2
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.environment.settingsRevision")
                        .value(2));
        verify(worktrees).updateSettings("task-1", true, 2L);
    }

    private WorkspaceContextResponse context() {
        WorkspaceEnvironmentSummaryResponse environment =
                new WorkspaceEnvironmentSummaryResponse(
                        "LOCAL", "Local", "F:/project", null,
                        "main", "abc", "LOCAL", true, false,
                        "task-1", false, 2L, false, false
                );
        return new WorkspaceContextResponse(
                7L, "F:/project", "F:/project", "F:/project",
                environment, null, "abc", false,
                new WorkspaceGitStatusResponse(
                        true, 0, 0, 0, 0, 0, 0
                ),
                List.of(environment), List.of()
        );
    }
}
