package com.lumora.core.task.api.controller;

import com.lumora.core.task.api.converter.TaskResponseConverter;
import com.lumora.core.task.api.dto.request.CreateTaskRequest;
import com.lumora.core.task.api.dto.request.WorkspaceHandoffRequest;
import com.lumora.core.task.domain.entity.AgentTask;
import com.lumora.core.task.domain.entity.TaskPlanStep;
import com.lumora.core.task.domain.model.TaskStatus;
import com.lumora.core.shared.api.advice.RestExceptionHandler;
import com.lumora.core.task.domain.exception.TaskNotFoundException;
import com.lumora.core.task.application.service.TaskService;
import com.lumora.core.task.application.support.TaskCreationCoordinator;
import com.lumora.core.task.domain.model.TaskDetails;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class TaskControllerTest {

    private static final String TASK_ID = "task-1";
    private static final String CORRELATION_ID = "correlation-123";

    @Test
    void rejectsAutoApplyForAnExistingWorktreeBeforeCreatingTheTask() {
        TaskService taskService = org.mockito.Mockito.mock(TaskService.class);
        TaskCreationCoordinator creation = org.mockito.Mockito.mock(
                TaskCreationCoordinator.class
        );
        when(creation.createTask(
                any(), any(), any(), any(), any(), any()
        )).thenThrow(new IllegalArgumentException(
                "现有 Worktree 由用户管理，不能开启自动应用"
        ));
        TaskController controller = new TaskController(
                taskService, new TaskResponseConverter(), creation
        );
        WorkspaceHandoffRequest selection = new WorkspaceHandoffRequest();
        selection.setTarget("EXISTING_WORKTREE");
        selection.setWorktreePath("F:/project/external");
        selection.setAutoApplyWhenClean(true);
        CreateTaskRequest request = new CreateTaskRequest();
        request.setGoal("inspect external tree");
        request.setWorkspacePath("F:/project/local");
        request.setEnvironmentSelection(selection);

        assertThatThrownBy(() -> controller.createTask(
                request, CORRELATION_ID
        )).isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("不能开启自动应用");
        verify(taskService, never()).createTask(
                anyString(), anyString(), anyString()
        );
    }

    @Test
    void createsATaskWithAResponseDto() throws Exception {
        TaskService service = org.mockito.Mockito.mock(TaskService.class);
        when(service.createTask(
                "整理下载目录",
                "F:\\project\\test",
                CORRELATION_ID
        ))
                .thenReturn(taskDetails());
        MockMvc mockMvc = mockMvc(service);

        mockMvc.perform(post("/api/v1/tasks")
                        .header("X-Correlation-Id", CORRELATION_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "goal": "整理下载目录",
                                  "workspacePath": "F:\\\\project\\\\test"
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.taskId").value(TASK_ID))
                .andExpect(jsonPath("$.workspacePath")
                        .value("F:\\project\\test"))
                .andExpect(jsonPath("$.status").value("PLANNING"))
                .andExpect(jsonPath("$.planSteps[0].stepId").value("scan"))
                .andExpect(jsonPath("$.planSteps[0].title")
                        .value("扫描下载目录"))
                .andExpect(jsonPath("$.planSteps[1].requiresApproval")
                        .value(true));
    }

    @Test
    void updatesATaskWorkspace() throws Exception {
        TaskService service = org.mockito.Mockito.mock(TaskService.class);
        AgentTask updated = taskDetails().getTask();
        updated.setWorkspacePath("F:\\project\\LUMORA");
        when(service.updateWorkspacePath(
                TASK_ID,
                "F:\\project\\LUMORA"
        )).thenReturn(updated);
        MockMvc mockMvc = mockMvc(service);

        mockMvc.perform(put("/api/v1/tasks/{taskId}/workspace", TASK_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "workspacePath": "F:\\\\project\\\\LUMORA"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.workspacePath")
                        .value("F:\\project\\LUMORA"));
    }

    @Test
    void returnsNotFoundForAnUnknownTask() throws Exception {
        TaskService service = org.mockito.Mockito.mock(TaskService.class);
        when(service.getTaskDetails("missing"))
                .thenThrow(new TaskNotFoundException("missing"));
        MockMvc mockMvc = mockMvc(service);

        mockMvc.perform(get("/api/v1/tasks/missing"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("TASK_NOT_FOUND"));
    }

    @Test
    void listsPersistedTasksForConversationHistory() throws Exception {
        TaskService service = org.mockito.Mockito.mock(TaskService.class);
        when(service.listTasks()).thenReturn(List.of(
                taskDetails().getTask()
        ));
        MockMvc mockMvc = mockMvc(service);

        mockMvc.perform(get("/api/v1/tasks"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].taskId").value(TASK_ID))
                .andExpect(jsonPath("$[0].goal").value("整理下载目录"))
                .andExpect(jsonPath("$[0].status").value("PLANNING"));
    }

    @Test
    void rejectsABlankGoal() throws Exception {
        MockMvc mockMvc = mockMvc(
                org.mockito.Mockito.mock(TaskService.class)
        );

        mockMvc.perform(post("/api/v1/tasks")
                        .header("X-Correlation-Id", CORRELATION_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"goal\":\"   \"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void rejectsARequestWithoutCorrelationId() throws Exception {
        MockMvc mockMvc = mockMvc(
                org.mockito.Mockito.mock(TaskService.class)
        );

        mockMvc.perform(post("/api/v1/tasks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"goal\":\"整理下载目录\"}"))
                .andExpect(status().isBadRequest());
    }

    private static MockMvc mockMvc(TaskService service) {
        return standaloneSetup(new TaskController(
                service,
                new TaskResponseConverter(),
                creationCoordinator(service)
        ))
                .setControllerAdvice(new RestExceptionHandler())
                .build();
    }

    private static TaskCreationCoordinator creationCoordinator(
            TaskService taskService
    ) {
        TaskCreationCoordinator result = org.mockito.Mockito.mock(
                TaskCreationCoordinator.class
        );
        doAnswer(invocation -> taskService.createTask(
                invocation.getArgument(0), invocation.getArgument(1),
                invocation.getArgument(2)
        )).when(result).createTask(
                any(), any(), any(), any(), any(), any()
        );
        return result;
    }

    private static TaskDetails taskDetails() {
        Instant now = Instant.parse("2026-07-24T00:00:00Z");
        AgentTask task = new AgentTask(
                TASK_ID,
                "整理下载目录",
                TaskStatus.PLANNING,
                0L,
                "扫描下载目录",
                "",
                "",
                now,
                now
        );
        task.setWorkspacePath("F:\\project\\test");
        return new TaskDetails(
                task,
                List.of(
                        new TaskPlanStep(
                                TASK_ID,
                                0,
                                "scan",
                                "扫描下载目录",
                                "读取待整理文件",
                                false
                        ),
                        new TaskPlanStep(
                                TASK_ID,
                                1,
                                "move",
                                "移动文件",
                                "按分类移动文件",
                                true
                        )
                )
        );
    }
}
