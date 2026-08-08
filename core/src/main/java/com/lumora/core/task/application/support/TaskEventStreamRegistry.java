package com.lumora.core.task.application.support;

import com.lumora.core.task.application.service.TaskService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

@Component
@RequiredArgsConstructor
public class TaskEventStreamRegistry {

    private final TaskService taskService;
    private final Map<String, List<SseEmitter>> subscribers =
            new ConcurrentHashMap<>();

    /**
     * 订阅指定任务的状态事件，并在连接结束时自动清理订阅关系。
     *
     * @param taskId 任务 ID
     * @return 永不主动超时的 SSE 发送器
     */
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
