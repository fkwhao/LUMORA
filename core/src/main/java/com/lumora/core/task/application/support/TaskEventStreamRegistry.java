package com.lumora.core.task.application.support;

import com.lumora.core.task.application.service.TaskService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
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
        sendConnectedComment(taskId, emitter);
        return emitter;
    }

    /**
     * Flush an SSE frame immediately so clients receive the HTTP response
     * headers even when the task has no state event for a long time. A comment
     * frame carries no task payload and is ignored by the desktop event parser.
     */
    private void sendConnectedComment(String taskId, SseEmitter emitter) {
        try {
            emitter.send(SseEmitter.event().comment("connected"));
        } catch (IOException exception) {
            remove(taskId, emitter);
            emitter.completeWithError(exception);
            throw new IllegalStateException("无法建立任务事件流", exception);
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
