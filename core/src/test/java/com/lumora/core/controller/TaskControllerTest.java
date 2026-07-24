package com.lumora.core.controller;

import com.lumora.core.dto.response.TaskResponse;
import com.lumora.core.entity.AgentTask;
import com.lumora.core.entity.TaskStatus;
import com.lumora.core.exception.RestExceptionHandler;
import com.lumora.core.exception.TaskNotFoundException;
import com.lumora.core.service.TaskService;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class TaskControllerTest {

    private static final String TASK_ID = "task-1";

    @Test
    void createsATaskWithAResponseDto() throws Exception {
        TaskService service = org.mockito.Mockito.mock(TaskService.class);
        when(service.createTask("整理下载目录")).thenReturn(task());
        MockMvc mockMvc = mockMvc(service);

        mockMvc.perform(post("/api/v1/tasks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"goal\":\"整理下载目录\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.taskId").value(TASK_ID))
                .andExpect(jsonPath("$.status").value("CREATED"));
    }

    @Test
    void returnsNotFoundForAnUnknownTask() throws Exception {
        TaskService service = org.mockito.Mockito.mock(TaskService.class);
        when(service.getTask("missing"))
                .thenThrow(new TaskNotFoundException("missing"));
        MockMvc mockMvc = mockMvc(service);

        mockMvc.perform(get("/api/v1/tasks/missing"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("TASK_NOT_FOUND"));
    }

    @Test
    void rejectsABlankGoal() throws Exception {
        MockMvc mockMvc = mockMvc(
                org.mockito.Mockito.mock(TaskService.class)
        );

        mockMvc.perform(post("/api/v1/tasks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"goal\":\"   \"}"))
                .andExpect(status().isBadRequest());
    }

    private static MockMvc mockMvc(TaskService service) {
        return standaloneSetup(new TaskController(service))
                .setControllerAdvice(new RestExceptionHandler())
                .build();
    }

    private static AgentTask task() {
        Instant now = Instant.parse("2026-07-24T00:00:00Z");
        return new AgentTask(
                TASK_ID,
                "整理下载目录",
                TaskStatus.CREATED,
                0L,
                "",
                "",
                "",
                now,
                now
        );
    }
}
