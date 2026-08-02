package com.lumora.core.controller;

import com.lumora.core.common.constant.ApiPathConstants;
import com.lumora.core.dto.request.ApprovalDecisionRequest;
import com.lumora.core.dto.response.TaskResponse;
import com.lumora.core.entity.AgentTask;
import com.lumora.core.service.ApprovalService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 审批 REST 入口，审批合法性由 ApprovalService 统一判断。
 */
@RestController
@RequiredArgsConstructor
@RequestMapping(ApiPathConstants.TASK_APPROVALS)
public class ApprovalController {

    private final ApprovalService approvalService;

    @PostMapping(ApiPathConstants.APPROVAL_BY_ID)
    public TaskResponse decideApproval(
            @PathVariable String taskId,
            @PathVariable String approvalId,
            @Valid @RequestBody ApprovalDecisionRequest request
    ) {
        AgentTask task = approvalService.decideApproval(
                taskId,
                approvalId,
                request.getDecision()
        );
        return TaskResponse.fromEntity(task);
    }
}
