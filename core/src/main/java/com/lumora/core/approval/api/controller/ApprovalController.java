package com.lumora.core.approval.api.controller;

import com.lumora.core.task.api.converter.TaskResponseConverter;

import com.lumora.core.shared.api.constant.ApiPathConstants;
import com.lumora.core.task.api.converter.TaskResponseConverter;
import com.lumora.core.approval.api.dto.request.ApprovalDecisionRequest;
import com.lumora.core.task.api.dto.response.TaskResponse;
import com.lumora.core.task.domain.entity.AgentTask;
import com.lumora.core.approval.domain.model.ApprovalDecision;
import com.lumora.core.approval.application.service.ApprovalService;
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
    private final TaskResponseConverter responseConverter;

    @PostMapping(ApiPathConstants.APPROVAL_BY_ID)
    public TaskResponse decideApproval(
            @PathVariable String taskId,
            @PathVariable String approvalId,
            @Valid @RequestBody ApprovalDecisionRequest request
    ) {
        AgentTask task = approvalService.decideApproval(
                taskId,
                approvalId,
                ApprovalDecision.valueOf(request.getDecision())
        );
        return responseConverter.fromTask(task);
    }
}
