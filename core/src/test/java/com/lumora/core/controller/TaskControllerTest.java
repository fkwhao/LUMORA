package com.lumora.core.controller;

import com.lumora.core.converter.TaskResponseConverter;
import com.lumora.core.entity.AgentTask;
import com.lumora.core.entity.TaskPlanStep;
import com.lumora.core.entity.TaskStatus;
import com.lumora.core.exception.RestExceptionHandler;
import com.lumora.core.exception.TaskNotFoundException;
import com.lumora.core.service.TaskService;
import com.lumora.core.task.model.TaskDetails;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class TaskControllerTest {

    private static final String TASK_ID = "task-1";
    private static final String CORRELATION_ID = "correlation-123";

    @Test
    void createsATaskWithAResponseDto() throws Exception {
        TaskService service = org.mockito.Mockito.mock(TaskService.class);
        when(service.createTask("整理下载目录", CORRELATION_ID))
                .thenReturn(taskDetails());
        MockMvc mockMvc = mockMvc(service);

        mockMvc.perform(post("/api/v1/tasks")
                        .header("X-Correlation-Id", CORRELATION_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"goal\":\"整理下载目录\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.taskId").value(TASK_ID))
                .andExpect(jsonPath("$.status").value("PLANNING"))
                .andExpect(jsonPath("$.planSteps[0].stepId").value("scan"))
                .andExpect(jsonPath("$.planSteps[0].title")
                        .value("扫描下载目录"))
                .andExpect(jsonPath("$.planSteps[1].requiresApproval")
                        .value(true));
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
                new TaskResponseConverter()
        ))
                .setControllerAdvice(new RestExceptionHandler())
                .build();
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
