package com.lumora.core.task.api.controller;

import com.lumora.core.task.application.service.TaskService;
import com.lumora.core.task.application.support.TaskEventStreamRegistry;
import com.lumora.core.task.domain.entity.AgentTask;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class TaskEventControllerTest {

    @Test
    void flushesACommentFrameWhenTheSubscriptionOpens() throws Exception {
        TaskService taskService = mock(TaskService.class);
        when(taskService.getTask("task-1")).thenReturn(new AgentTask());
        TaskEventStreamRegistry registry =
                new TaskEventStreamRegistry(taskService);
        MockMvc mockMvc = standaloneSetup(
                new TaskEventController(registry)
        ).build();

        mockMvc.perform(get("/api/v1/tasks/task-1/events")
                        .accept(MediaType.TEXT_EVENT_STREAM))
                .andExpect(status().isOk())
                .andExpect(request().asyncStarted())
                .andExpect(content().contentTypeCompatibleWith(
                        MediaType.TEXT_EVENT_STREAM
                ))
                .andExpect(content().string(":connected\n\n"));
    }
}
