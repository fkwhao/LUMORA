package com.lumora.core.controller;

import com.lumora.core.common.constant.ApiPathConstants;
import com.lumora.core.controller.support.TaskEventStreamRegistry;
import lombok.RequiredArgsConstructor;
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
@RequiredArgsConstructor
@RequestMapping(ApiPathConstants.TASKS)
public class TaskEventController {

    private final TaskEventStreamRegistry eventStreamRegistry;

    @GetMapping(
            value = ApiPathConstants.TASK_EVENTS,
            produces = MediaType.TEXT_EVENT_STREAM_VALUE
    )
    public SseEmitter subscribe(@PathVariable String taskId) {
        return eventStreamRegistry.subscribe(taskId);
    }
}
