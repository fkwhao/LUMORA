package com.lumora.core.conversation.application.support;

import com.lumora.core.conversation.domain.entity.ConversationRun;
import com.lumora.core.conversation.domain.model.ConversationRunStatus;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ConversationRunEventStreamRegistryTest {

    @Test
    void aSlowReplayDoesNotBlockAnotherRunSubscription() throws Exception {
        ConversationRunStore runStore = mock(ConversationRunStore.class);
        ConversationRun running = new ConversationRun();
        running.setStatus(ConversationRunStatus.RUNNING);
        when(runStore.require(anyString())).thenReturn(running);
        CountDownLatch firstReplayStarted = new CountDownLatch(1);
        CountDownLatch releaseFirstReplay = new CountDownLatch(1);
        when(runStore.listEventsAfter("run-a", 0L)).thenAnswer(invocation -> {
            firstReplayStarted.countDown();
            if (!releaseFirstReplay.await(2L, TimeUnit.SECONDS)) {
                throw new IllegalStateException("Timed out waiting for replay");
            }
            return List.of();
        });
        when(runStore.listEventsAfter("run-b", 0L)).thenReturn(List.of());
        ConversationRunEventStreamRegistry registry =
                new ConversationRunEventStreamRegistry(runStore);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<SseEmitter> first = executor.submit(
                    () -> registry.subscribeRaw("run-a", 0L)
            );
            assertThat(firstReplayStarted.await(1L, TimeUnit.SECONDS))
                    .isTrue();

            Future<SseEmitter> second = executor.submit(
                    () -> registry.subscribeRaw("run-b", 0L)
            );

            assertThat(second.get(1L, TimeUnit.SECONDS)).isNotNull();
            releaseFirstReplay.countDown();
            assertThat(first.get(1L, TimeUnit.SECONDS)).isNotNull();
        } finally {
            releaseFirstReplay.countDown();
            registry.complete("run-a");
            registry.complete("run-b");
            executor.shutdownNow();
        }
    }
}
