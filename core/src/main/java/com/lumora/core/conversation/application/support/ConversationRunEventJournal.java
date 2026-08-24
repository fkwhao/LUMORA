package com.lumora.core.conversation.application.support;

import com.lumora.core.conversation.domain.model.ChatStreamEvent;
import com.lumora.core.conversation.domain.model.ConversationRunEventEnvelope;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.ArrayDeque;
import java.util.ArrayList;
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
    private static final int MAX_PERSISTENCE_ATTEMPTS = 5;

    private final ConversationRunStore runStore;
    private final ConversationRunEventStreamRegistry eventStreams;
    private final WorkspaceChangeLedgerService workspaceLedger;
    private final long flushIntervalMillis;
    private final Object queueMonitor = new Object();
    private final Map<String, ArrayDeque<ChatStreamEvent>> pending =
            new LinkedHashMap<>();
    private final Map<String, Integer> persistenceAttempts =
            new LinkedHashMap<>();
    private final Map<String, ArrayDeque<ChatStreamEvent>> quarantined =
            new LinkedHashMap<>();
    private final AtomicReference<Thread> writerThread =
            new AtomicReference<>();
    private final ScheduledExecutorService writer;
    private ScheduledFuture<?> scheduledFlush;
    private boolean closed;

    @Autowired
    public ConversationRunEventJournal(
            ConversationRunStore runStore,
            ConversationRunEventStreamRegistry eventStreams,
            WorkspaceChangeLedgerService workspaceLedger,
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
        this.workspaceLedger = workspaceLedger;
        this.flushIntervalMillis = flushIntervalMillis;
        this.writer = Executors.newSingleThreadScheduledExecutor(task -> {
            Thread thread = new Thread(task, "run-event-journal");
            thread.setDaemon(true);
            writerThread.set(thread);
            return thread;
        });
    }

    /** Test-compatible constructor; production always supplies the ledger. */
    public ConversationRunEventJournal(
            ConversationRunStore runStore,
            ConversationRunEventStreamRegistry eventStreams,
            long flushIntervalMillis
    ) {
        this(runStore, eventStreams, null, flushIntervalMillis);
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
            ArrayDeque<ChatStreamEvent> isolated = quarantined.get(runId);
            if (isolated != null) {
                // Preserve ordering and evidence after a permanent projection
                // failure, but do not restart the tight automatic retry loop.
                isolated.addLast(event);
                return;
            }
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
        synchronized (queueMonitor) {
            if (quarantined.containsKey(runId)) {
                throw new IllegalStateException(
                        "运行事件批次已在连续落库失败后隔离，自动重试已停止: "
                                + runId
                );
            }
        }
        List<ChatStreamEvent> batch = take(runId);
        if (batch.isEmpty()) {
            return;
        }
        try {
            persistAndPublish(runId, batch);
            clearPersistenceAttempts(runId);
        } catch (RuntimeException error) {
            retainFailedBatch(runId, batch, error);
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
                clearPersistenceAttempts(entry.getKey());
            } catch (RuntimeException error) {
                retainFailedBatch(entry.getKey(), entry.getValue(), error);
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
        var run = workspaceLedger == null ? null : runStore.require(runId);
        List<ChatStreamEvent> durableBatch = batch;
        if (workspaceLedger != null) {
            durableBatch = new ArrayList<>(batch.size());
            for (ChatStreamEvent event : batch) {
                long revision = workspaceLedger.project(run, event);
                if (revision < 0L) {
                    durableBatch.add(event);
                    continue;
                }
                Map<String, Object> metadata = new LinkedHashMap<>(
                        event.getMetadata()
                );
                Object rawChanges = metadata.remove("workspaceChanges");
                List<Map<String, Object>> changedFiles = changeSummaries(
                        rawChanges
                );
                metadata.put("workspaceRevision", revision);
                metadata.put("workspaceRevisionSource", "CORE");
                metadata.put("workspaceChangeCount", changedFiles.size());
                metadata.put("workspaceChangedFiles", changedFiles);
                durableBatch.add(event.withMetadata(Map.copyOf(metadata)));
            }
        }
        List<ConversationRunEventEnvelope> persisted = runStore.appendEvents(
                runId, durableBatch
        );
        for (ConversationRunEventEnvelope envelope : persisted) {
            try {
                eventStreams.publish(envelope);
            } catch (RuntimeException error) {
                // Persistence already committed. Re-queuing here would create
                // a second durable event sequence; a broken subscriber may
                // reconnect and replay the committed event instead.
                LOGGER.warn(
                        "Failed to publish persisted run event {}:{}",
                        envelope.runId(), envelope.sequence(), error
                );
            }
        }
    }

    private static List<Map<String, Object>> changeSummaries(Object value) {
        if (!(value instanceof Iterable<?> iterable)) return List.of();
        List<Map<String, Object>> result = new ArrayList<>();
        for (Object item : iterable) {
            if (result.size() >= 500 || !(item instanceof Map<?, ?> raw)) {
                continue;
            }
            Map<String, Object> summary = new LinkedHashMap<>();
            for (String key : List.of(
                    "path", "operation", "previousPath",
                    "beforeHash", "afterHash"
            )) {
                Object field = raw.get(key);
                if (field != null) summary.put(key, field);
            }
            result.add(Map.copyOf(summary));
        }
        return List.copyOf(result);
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

    private void retainFailedBatch(
            String runId,
            List<ChatStreamEvent> failedBatch,
            RuntimeException error
    ) {
        int attempt;
        boolean isolated;
        synchronized (queueMonitor) {
            attempt = persistenceAttempts.merge(runId, 1, Integer::sum);
            ArrayDeque<ChatStreamEvent> combined = new ArrayDeque<>(
                    failedBatch
            );
            ArrayDeque<ChatStreamEvent> newer = pending.get(runId);
            if (newer != null) {
                combined.addAll(newer);
            }
            isolated = attempt >= MAX_PERSISTENCE_ATTEMPTS;
            if (isolated) {
                pending.remove(runId);
                quarantined.put(runId, combined);
            } else {
                pending.put(runId, combined);
            }
        }
        if (isolated) {
            LOGGER.error(
                    "Quarantined {} run events for {} after {} failed "
                            + "persistence attempts; automatic retries stopped",
                    failedBatch.size(), runId, attempt, error
            );
        } else if (attempt == 1) {
            LOGGER.warn(
                    "Failed to persist run event batch for {}; retrying "
                            + "automatically (attempt {}/{})",
                    runId, attempt, MAX_PERSISTENCE_ATTEMPTS, error
            );
        }
    }

    private void clearPersistenceAttempts(String runId) {
        synchronized (queueMonitor) {
            persistenceAttempts.remove(runId);
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
            // retainFailedBatch logs the first failure and the final isolation.
            // Intermediate retries stay quiet so one poison event cannot flood
            // the Java console every flush interval.
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
            logQuarantinedEventsAtShutdown();
            writer.shutdown();
        }
    }

    private void logQuarantinedEventsAtShutdown() {
        int runCount;
        int eventCount;
        synchronized (queueMonitor) {
            runCount = quarantined.size();
            eventCount = quarantined.values().stream()
                    .mapToInt(ArrayDeque::size)
                    .sum();
        }
        if (eventCount > 0) {
            LOGGER.error(
                    "Shutting down with {} quarantined run events across {} "
                            + "runs; the batches were not persisted",
                    eventCount, runCount
            );
        }
    }
}
