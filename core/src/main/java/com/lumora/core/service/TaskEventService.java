package com.lumora.core.service;

import com.lumora.core.dto.response.TaskResponse;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

@Service
public class TaskEventService {

    private final TaskService taskService;
    private final Map<String, List<SseEmitter>> subscribers =
            new ConcurrentHashMap<>();

    public TaskEventService(TaskService taskService) {
        this.taskService = taskService;
    }

    public SseEmitter subscribe(String taskId) {
        taskService.getTask(taskId);
        SseEmitter emitter = new SseEmitter(0L);
        subscribers.computeIfAbsent(
                taskId,
                ignored -> new CopyOnWriteArrayList<>()
        ).add(emitter);
        emitter.onCompletion(() -> remove(taskId, emitter));
        emitter.onTimeout(() -> remove(taskId, emitter));
        emitter.onError(ignored -> remove(taskId, emitter));
        return emitter;
    }

    /**
     * Service 完成状态变更后调用，Controller 不直接管理订阅者生命周期。
     */
    public void publish(String taskId, TaskResponse event) {
        List<SseEmitter> emitters = subscribers.getOrDefault(
                taskId,
                List.of()
        );
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event().name("task").data(event));
            } catch (IOException error) {
                emitter.completeWithError(error);
                remove(taskId, emitter);
            }
        }
    }

    private void remove(String taskId, SseEmitter emitter) {
        List<SseEmitter> emitters = subscribers.get(taskId);
        if (emitters == null) {
            return;
        }
        emitters.remove(emitter);
        if (emitters.isEmpty()) {
            subscribers.remove(taskId);
        }
    }
}
