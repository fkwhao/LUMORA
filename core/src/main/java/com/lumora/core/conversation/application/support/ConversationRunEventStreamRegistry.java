package com.lumora.core.conversation.application.support;

import com.lumora.core.conversation.api.dto.response.ConversationRunEventResponse;
import com.lumora.core.conversation.domain.entity.ConversationRun;
import com.lumora.core.conversation.domain.entity.ConversationRunEvent;
import com.lumora.core.conversation.domain.model.ChatStreamEventType;
import com.lumora.core.conversation.domain.model.ConversationRunEventEnvelope;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Replayable SSE fan-out that never owns or cancels the underlying run. */
@Component
@RequiredArgsConstructor
public class ConversationRunEventStreamRegistry {

    private record Subscriber(SseEmitter emitter, boolean envelope) {
    }

    private final ConversationRunStore runStore;
    private final Map<String, List<Subscriber>> subscribers =
            new ConcurrentHashMap<>();

    public synchronized SseEmitter subscribeRaw(
            String runId,
            long afterSequence
    ) {
        return subscribe(runId, afterSequence, false);
    }

    public synchronized SseEmitter subscribeEnvelope(
            String runId,
            long afterSequence
    ) {
        return subscribe(runId, afterSequence, true);
    }

    private SseEmitter subscribe(
            String runId,
            long afterSequence,
            boolean envelope
    ) {
        ConversationRun run = runStore.require(runId);
        SseEmitter emitter = new SseEmitter(0L);
        Subscriber subscriber = new Subscriber(emitter, envelope);
        subscribers.computeIfAbsent(runId, ignored -> new ArrayList<>())
                .add(subscriber);
        emitter.onCompletion(() -> remove(runId, subscriber));
        emitter.onTimeout(() -> remove(runId, subscriber));
        emitter.onError(ignored -> remove(runId, subscriber));
        sendComment(runId, subscriber);
        for (ConversationRunEvent event : runStore.listEventsAfter(
                runId, afterSequence
        )) {
            sendReplay(runId, subscriber, event);
        }
        if (run.getStatus().isTerminal()) {
            emitter.complete();
        }
        return emitter;
    }

    public synchronized void publish(ConversationRunEventEnvelope envelope) {
        List<Subscriber> current = List.copyOf(
                subscribers.getOrDefault(envelope.runId(), List.of())
        );
        for (Subscriber subscriber : current) {
            try {
                Object payload = subscriber.envelope()
                        ? ConversationRunEventResponse.from(envelope)
                        : envelope.event();
                subscriber.emitter().send(
                        SseEmitter.event().data(payload)
                );
            } catch (IOException error) {
                remove(envelope.runId(), subscriber);
                subscriber.emitter().completeWithError(error);
            }
        }
        if (envelope.event().getType() == ChatStreamEventType.COMPLETED
                || envelope.event().getType() == ChatStreamEventType.FAILED) {
            complete(envelope.runId());
        }
    }

    public synchronized void complete(String runId) {
        List<Subscriber> current = subscribers.remove(runId);
        if (current == null) {
            return;
        }
        current.forEach(subscriber -> subscriber.emitter().complete());
    }

    private void sendReplay(
            String runId,
            Subscriber subscriber,
            ConversationRunEvent event
    ) {
        try {
            Object payload = subscriber.envelope()
                    ? ConversationRunEventResponse.replay(
                            runId,
                            event.getSequence(),
                            runStore.readEventJson(event),
                            event.getOccurredAt()
                    )
                    : runStore.readEventJson(event);
            subscriber.emitter().send(SseEmitter.event().data(payload));
        } catch (IOException error) {
            remove(runId, subscriber);
            subscriber.emitter().completeWithError(error);
        }
    }

    private void sendComment(String runId, Subscriber subscriber) {
        try {
            subscriber.emitter().send(
                    SseEmitter.event().comment("connected")
            );
        } catch (IOException error) {
            remove(runId, subscriber);
            subscriber.emitter().completeWithError(error);
        }
    }

    private synchronized void remove(String runId, Subscriber subscriber) {
        List<Subscriber> current = subscribers.get(runId);
        if (current == null) {
            return;
        }
        current.remove(subscriber);
        if (current.isEmpty()) {
            subscribers.remove(runId);
        }
    }
}
