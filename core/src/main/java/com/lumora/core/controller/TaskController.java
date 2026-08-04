package com.lumora.core.controller;

import com.lumora.core.common.constant.ApiPathConstants;
import com.lumora.core.common.constant.HttpContractConstants;
import com.lumora.core.converter.TaskResponseConverter;
import com.lumora.core.dto.request.CreateTaskRequest;
import com.lumora.core.dto.response.TaskResponse;
import com.lumora.core.service.TaskService;
import com.lumora.core.task.model.TaskDetails;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 桌面端任务 REST 入口，只负责 DTO 转换和参数校验。
 */
@RestController
@RequiredArgsConstructor
@RequestMapping(ApiPathConstants.TASKS)
public class TaskController {

    private final TaskService taskService;
    private final TaskResponseConverter responseConverter;

    @PostMapping
    public ResponseEntity<TaskResponse> createTask(
            @Valid @RequestBody CreateTaskRequest request,
            @RequestHeader(HttpContractConstants.CORRELATION_ID_HEADER)
            String correlationId
    ) {
        TaskDetails task = taskService.createTask(
                request.getGoal(),
                correlationId
        );
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(responseConverter.fromDetails(task));
    }

    @GetMapping
    public List<TaskResponse> listTasks() {
        return taskService.listTasks().stream()
                .map(responseConverter::fromTask)
                .toList();
    }

    @GetMapping(ApiPathConstants.TASK_BY_ID)
    public TaskResponse getTask(@PathVariable String taskId) {
        return responseConverter.fromDetails(taskService.getTaskDetails(taskId));
    }
}
