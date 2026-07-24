package com.lumora.core.controller;

import com.lumora.core.entity.AgentTask;
import com.lumora.core.entity.ApprovalDecision;
import com.lumora.core.entity.TaskStatus;
import com.lumora.core.exception.RestExceptionHandler;
import com.lumora.core.service.ApprovalService;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class ApprovalControllerTest {

    @Test
    void passesOnlyARecognizedDecisionToTheService() throws Exception {
        ApprovalService service =
                org.mockito.Mockito.mock(ApprovalService.class);
        when(service.decideApproval(
                "task-1",
                "approval-1",
                ApprovalDecision.ALLOW_ONCE
        )).thenReturn(task());
        MockMvc mockMvc = standaloneSetup(new ApprovalController(service))
                .setControllerAdvice(new RestExceptionHandler())
                .build();

        mockMvc.perform(post(
                        "/api/v1/tasks/task-1/approvals/approval-1"
                )
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"decision\":\"ALLOW_ONCE\"}"))
                .andExpect(status().isOk());

        verify(service).decideApproval(
                "task-1",
                "approval-1",
                ApprovalDecision.ALLOW_ONCE
        );
    }

    @Test
    void rejectsAnUnknownDecision() throws Exception {
        ApprovalService service =
                org.mockito.Mockito.mock(ApprovalService.class);
        MockMvc mockMvc = standaloneSetup(new ApprovalController(service))
                .setControllerAdvice(new RestExceptionHandler())
                .build();

        mockMvc.perform(post(
                        "/api/v1/tasks/task-1/approvals/approval-1"
                )
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"decision\":\"ALLOW_ALWAYS\"}"))
                .andExpect(status().isBadRequest());
    }

    private static AgentTask task() {
        Instant now = Instant.parse("2026-07-24T00:00:00Z");
        return new AgentTask(
                "task-1",
                "整理下载目录",
                TaskStatus.COMPLETED,
                0L,
                "",
                "任务已完成",
                "",
                now,
                now
        );
    }
}
