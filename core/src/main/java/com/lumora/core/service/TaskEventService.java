package com.lumora.core.service;

import com.lumora.core.dto.response.TaskResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

@Service
@RequiredArgsConstructor
public class TaskEventService {

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

    /**
     * Service 完成状态变更后调用，Controller 不直接管理订阅者生命周期。
     *
     * @param taskId 任务 ID
     * @param event 最新任务快照
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
