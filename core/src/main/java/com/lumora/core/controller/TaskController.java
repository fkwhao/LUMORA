package com.lumora.core.controller;

import com.lumora.core.dto.request.CreateTaskRequest;
import com.lumora.core.dto.response.TaskResponse;
import com.lumora.core.entity.AgentTask;
import com.lumora.core.service.TaskService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 桌面端任务 REST 入口，只负责 DTO 转换和参数校验。
 */
@RestController
@RequestMapping("/api/v1/tasks")
public class TaskController {

    private final TaskService taskService;

    public TaskController(TaskService taskService) {
        this.taskService = taskService;
    }

    @PostMapping
    public ResponseEntity<TaskResponse> createTask(
            @Valid @RequestBody CreateTaskRequest request
    ) {
        AgentTask task = taskService.createTask(request.getGoal());
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(TaskResponse.fromEntity(task));
    }

    @GetMapping("/{taskId}")
    public TaskResponse getTask(@PathVariable String taskId) {
        return TaskResponse.fromEntity(taskService.getTask(taskId));
    }
}
