package com.lumora.core.conversation.application.support;

import com.lumora.core.conversation.domain.model.ChatStreamEvent;
import com.lumora.core.conversation.domain.model.ConversationRunEventEnvelope;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayDeque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Short-window write-behind journal for replayable run events.
 *
 * <p>Events remain individually sequenced and are published only after their
 * database transaction commits. Terminal and lifecycle boundaries call
 * {@link #flush(String)} or {@link #appendImmediately(String, ChatStreamEvent)}
 * so durable recovery never depends on the timer.</p>
 */
@Component
public class ConversationRunEventJournal implements AutoCloseable {

    private static final Logger LOGGER = LoggerFactory.getLogger(
            ConversationRunEventJournal.class
    );

    private final ConversationRunStore runStore;
    private final ConversationRunEventStreamRegistry eventStreams;
    private final long flushIntervalMillis;
    private final Object queueMonitor = new Object();
    private final Map<String, ArrayDeque<ChatStreamEvent>> pending =
            new LinkedHashMap<>();
    private final AtomicReference<Thread> writerThread =
            new AtomicReference<>();
    private final ScheduledExecutorService writer;
    private ScheduledFuture<?> scheduledFlush;
    private boolean closed;

    public ConversationRunEventJournal(
            ConversationRunStore runStore,
            ConversationRunEventStreamRegistry eventStreams,
            @Value("${lumora.runs.event-flush-interval-ms:20}")
            long flushIntervalMillis
    ) {
        if (flushIntervalMillis < 1L) {
            throw new IllegalArgumentException(
                    "lumora.runs.event-flush-interval-ms 必须大于 0"
            );
        }
        this.runStore = runStore;
        this.eventStreams = eventStreams;
        this.flushIntervalMillis = flushIntervalMillis;
        this.writer = Executors.newSingleThreadScheduledExecutor(task -> {
            Thread thread = new Thread(task, "run-event-journal");
            thread.setDaemon(true);
            writerThread.set(thread);
            return thread;
        });
    }

    /** Adds an event without waiting for SQLite. */
    public void append(String runId, ChatStreamEvent event) {
        if (runId == null || runId.isBlank()) {
            throw new IllegalArgumentException("运行 ID 不能为空");
        }
        if (event == null) {
            throw new IllegalArgumentException("运行事件不能为空");
        }
        synchronized (queueMonitor) {
            ensureOpen();
            pending.computeIfAbsent(runId, ignored -> new ArrayDeque<>())
                    .addLast(event);
            scheduleFlushLocked();
        }
    }

    /** Persists this event and every earlier pending event before returning. */
    public void appendImmediately(String runId, ChatStreamEvent event) {
        append(runId, event);
        flush(runId);
    }

    /** Drains all currently pending events for one run on the single writer. */
    public void flush(String runId) {
        if (runId == null || runId.isBlank()) {
            throw new IllegalArgumentException("运行 ID 不能为空");
        }
        runOnWriterAndWait(() -> flushRunNow(runId));
    }

    private void flushRunNow(String runId) {
        List<ChatStreamEvent> batch = take(runId);
        if (batch.isEmpty()) {
            return;
        }
        try {
            persistAndPublish(runId, batch);
        } catch (RuntimeException error) {
            requeueFirst(runId, batch);
            throw error;
        }
    }

    private void flushAllNow() {
        Map<String, List<ChatStreamEvent>> batches = takeAll();
        RuntimeException firstFailure = null;
        for (Map.Entry<String, List<ChatStreamEvent>> entry
                : batches.entrySet()) {
            try {
                persistAndPublish(entry.getKey(), entry.getValue());
            } catch (RuntimeException error) {
                requeueFirst(entry.getKey(), entry.getValue());
                if (firstFailure == null) {
                    firstFailure = error;
                }
            }
        }
        if (firstFailure != null) {
            throw firstFailure;
        }
    }

    private void persistAndPublish(
            String runId,
            List<ChatStreamEvent> batch
    ) {
        for (ConversationRunEventEnvelope envelope
                : runStore.appendEvents(runId, batch)) {
            eventStreams.publish(envelope);
        }
    }

    private List<ChatStreamEvent> take(String runId) {
        synchronized (queueMonitor) {
            ArrayDeque<ChatStreamEvent> events = pending.remove(runId);
            return events == null ? List.of() : List.copyOf(events);
        }
    }

    private Map<String, List<ChatStreamEvent>> takeAll() {
        synchronized (queueMonitor) {
            Map<String, List<ChatStreamEvent>> batches = new LinkedHashMap<>();
            pending.forEach((runId, events) ->
                    batches.put(runId, List.copyOf(events))
            );
            pending.clear();
            return batches;
        }
    }

    private void requeueFirst(
            String runId,
            List<ChatStreamEvent> failedBatch
    ) {
        synchronized (queueMonitor) {
            ArrayDeque<ChatStreamEvent> combined = new ArrayDeque<>(
                    failedBatch
            );
            ArrayDeque<ChatStreamEvent> newer = pending.get(runId);
            if (newer != null) {
                combined.addAll(newer);
            }
            pending.put(runId, combined);
        }
    }

    private void scheduleFlushLocked() {
        if (scheduledFlush != null && !scheduledFlush.isDone()) {
            return;
        }
        scheduledFlush = writer.schedule(
                this::flushAllSafely,
                flushIntervalMillis,
                TimeUnit.MILLISECONDS
        );
    }

    private void flushAllSafely() {
        synchronized (queueMonitor) {
            scheduledFlush = null;
        }
        try {
            flushAllNow();
        } catch (RuntimeException error) {
            LOGGER.error("Failed to flush run event batch", error);
        } finally {
            synchronized (queueMonitor) {
                if (!closed && !pending.isEmpty()) {
                    scheduleFlushLocked();
                }
            }
        }
    }

    private void runOnWriterAndWait(Runnable action) {
        if (Thread.currentThread() == writerThread.get()) {
            action.run();
            return;
        }
        Future<?> future = writer.submit(action);
        try {
            future.get();
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("等待运行事件落库时被中断", error);
        } catch (ExecutionException error) {
            Throwable cause = error.getCause();
            if (cause instanceof RuntimeException runtimeException) {
                throw runtimeException;
            }
            throw new IllegalStateException("无法保存运行事件", cause);
        }
    }

    private void ensureOpen() {
        if (closed) {
            throw new IllegalStateException("运行事件写入器已关闭");
        }
    }

    @Override
    @PreDestroy
    public void close() {
        synchronized (queueMonitor) {
            if (closed) {
                return;
            }
            closed = true;
            if (scheduledFlush != null) {
                scheduledFlush.cancel(false);
                scheduledFlush = null;
            }
        }
        try {
            runOnWriterAndWait(this::flushAllNow);
        } catch (RuntimeException error) {
            LOGGER.error("Failed to flush run events during shutdown", error);
        } finally {
            writer.shutdown();
        }
    }
}
