package com.lumora.core.conversation.application.support;

import com.lumora.core.conversation.domain.model.ChatStreamEvent;
import com.lumora.core.conversation.domain.model.ChatStreamEventType;
import com.lumora.core.conversation.domain.model.ConversationRunEventEnvelope;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Instant;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ConversationRunEventJournalTest {

    @Test
    void batchesPendingEventsAndPublishesOnlyAfterPersistence() {
        ConversationRunStore runStore = mock(ConversationRunStore.class);
        ConversationRunEventStreamRegistry streams = mock(
                ConversationRunEventStreamRegistry.class
        );
        AtomicLong sequence = new AtomicLong();
        when(runStore.appendEvents(eq("run-1"), anyList()))
                .thenAnswer(invocation -> {
                    List<ChatStreamEvent> events = invocation.getArgument(1);
                    return events.stream().map(event ->
                            new ConversationRunEventEnvelope(
                                    "run-1",
                                    sequence.incrementAndGet(),
                                    event,
                                    Instant.parse("2026-08-17T00:00:00Z")
                            )
                    ).toList();
                });
        ConversationRunEventJournal journal =
                new ConversationRunEventJournal(
                        runStore, streams, 60_000L
                );
        ChatStreamEvent first = event("first");
        ChatStreamEvent second = event("second");
        try {
            journal.append("run-1", first);
            journal.append("run-1", second);

            journal.flush("run-1");

            @SuppressWarnings("unchecked")
            ArgumentCaptor<List<ChatStreamEvent>> batch =
                    ArgumentCaptor.forClass(List.class);
            verify(runStore).appendEvents(eq("run-1"), batch.capture());
            assertThat(batch.getValue()).containsExactly(first, second);
            ArgumentCaptor<ConversationRunEventEnvelope> published =
                    ArgumentCaptor.forClass(
                            ConversationRunEventEnvelope.class
                    );
            verify(streams, times(2)).publish(published.capture());
            assertThat(published.getAllValues()).extracting(
                    ConversationRunEventEnvelope::sequence
            ).containsExactly(1L, 2L);
        } finally {
            journal.close();
        }
    }

    @Test
    void flushesAutomaticallyAfterTheConfiguredWindow() throws Exception {
        ConversationRunStore runStore = mock(ConversationRunStore.class);
        ConversationRunEventStreamRegistry streams = mock(
                ConversationRunEventStreamRegistry.class
        );
        CountDownLatch published = new CountDownLatch(1);
        when(runStore.appendEvents(eq("run-1"), anyList()))
                .thenAnswer(invocation -> {
                    ChatStreamEvent event = invocation.<List<ChatStreamEvent>>
                            getArgument(1).getFirst();
                    return List.of(new ConversationRunEventEnvelope(
                            "run-1", 1L, event, Instant.now()
                    ));
                });
        doAnswer(invocation -> {
            published.countDown();
            return null;
        }).when(streams).publish(
                org.mockito.ArgumentMatchers.any(
                        ConversationRunEventEnvelope.class
                )
        );
        ConversationRunEventJournal journal =
                new ConversationRunEventJournal(runStore, streams, 10L);
        try {
            journal.append("run-1", event("auto"));

            assertThat(published.await(2L, TimeUnit.SECONDS)).isTrue();
            verify(streams).publish(
                    org.mockito.ArgumentMatchers.any(
                            ConversationRunEventEnvelope.class
                    )
            );
        } finally {
            journal.close();
        }
    }

    @Test
    void publishFailureDoesNotRequeueAlreadyPersistedEvents() {
        ConversationRunStore runStore = mock(ConversationRunStore.class);
        ConversationRunEventStreamRegistry streams = mock(
                ConversationRunEventStreamRegistry.class
        );
        ChatStreamEvent event = event("durable");
        when(runStore.appendEvents(eq("run-1"), anyList())).thenReturn(
                List.of(new ConversationRunEventEnvelope(
                        "run-1", 1L, event,
                        Instant.parse("2026-08-17T00:00:00Z")
                ))
        );
        doThrow(new IllegalStateException("subscriber failed"))
                .when(streams).publish(
                        org.mockito.ArgumentMatchers.any(
                                ConversationRunEventEnvelope.class
                        )
                );
        ConversationRunEventJournal journal =
                new ConversationRunEventJournal(
                        runStore, streams, 60_000L
                );
        try {
            journal.append("run-1", event);
            journal.flush("run-1");
            journal.flush("run-1");

            verify(runStore).appendEvents(eq("run-1"), anyList());
            verify(streams).publish(
                    org.mockito.ArgumentMatchers.any(
                            ConversationRunEventEnvelope.class
                    )
            );
        } finally {
            journal.close();
        }
    }

    private ChatStreamEvent event(String content) {
        return new ChatStreamEvent(
                ChatStreamEventType.TEXT_DELTA,
                content,
                "demo",
                null,
                ""
        );
    }
}
