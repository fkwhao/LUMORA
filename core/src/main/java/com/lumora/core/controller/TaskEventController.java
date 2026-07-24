package com.lumora.core.controller;

import com.lumora.core.service.TaskEventService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Electron Main 持有 SSE 连接，再通过白名单 IPC 转发给 Renderer。
 */
@RestController
@RequestMapping("/api/v1/tasks")
public class TaskEventController {

    private final TaskEventService taskEventService;

    public TaskEventController(TaskEventService taskEventService) {
        this.taskEventService = taskEventService;
    }

    @GetMapping(
            value = "/{taskId}/events",
            produces = MediaType.TEXT_EVENT_STREAM_VALUE
    )
    public SseEmitter subscribe(@PathVariable String taskId) {
        return taskEventService.subscribe(taskId);
    }
}
