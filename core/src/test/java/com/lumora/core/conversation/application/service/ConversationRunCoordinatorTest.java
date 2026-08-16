package com.lumora.core.conversation.application.service;

import com.lumora.core.conversation.application.support.ConversationRunEventStreamRegistry;
import com.lumora.core.conversation.application.support.ConversationRunStore;
import com.lumora.core.conversation.domain.entity.ConversationRun;
import com.lumora.core.conversation.domain.model.ChatStreamEvent;
import com.lumora.core.conversation.domain.model.ChatStreamEventType;
import com.lumora.core.conversation.domain.model.ConversationRunStatus;
import com.lumora.core.conversation.domain.model.ConversationRunTrigger;
import com.lumora.core.task.application.service.TaskService;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ConversationRunCoordinatorTest {

    @Test
    void queuesAdditionalTasksUntilTheConcurrencySlotIsReleased() {
        ConversationService conversationService = mock(
                ConversationService.class
        );
        ConversationRunStore runStore = mock(ConversationRunStore.class);
        ConversationRunEventStreamRegistry streams = mock(
                ConversationRunEventStreamRegistry.class
        );
        Map<String, ConversationRun> runs = new LinkedHashMap<>();
        stubRunStore(runStore, runs);
        List<String> startedTaskIds = new ArrayList<>();
        List<Runnable> completions = new ArrayList<>();
        doAnswer(invocation -> {
            startedTaskIds.add(invocation.getArgument(0));
            completions.add(invocation.getArgument(8));
            return null;
        }).when(conversationService).streamMessage(
                anyString(), anyString(), any(), any(), any(), any(),
                anyString(), any(), any(), any()
        );
        ConversationRunCoordinator coordinator = new ConversationRunCoordinator(
                conversationService,
                runStore,
                streams,
                mock(TaskService.class),
                Clock.fixed(
                        Instant.parse("2026-08-15T00:00:00Z"),
                        ZoneOffset.UTC
                ),
                1
        );

        ConversationRun first = coordinator.startMessage(
                "task-1", "first", null, null, null, null, "correlation-1"
        );
        ConversationRun second = coordinator.startMessage(
                "task-2", "second", null, null, null, null, "correlation-2"
        );

        assertThat(first.getStatus()).isEqualTo(ConversationRunStatus.RUNNING);
        assertThat(second.getStatus()).isEqualTo(ConversationRunStatus.QUEUED);
        assertThat(startedTaskIds).containsExactly("task-1");

        completions.getFirst().run();

        assertThat(startedTaskIds).containsExactly("task-1", "task-2");
        assertThat(first.getStatus()).isEqualTo(ConversationRunStatus.COMPLETED);
        assertThat(second.getStatus()).isEqualTo(ConversationRunStatus.RUNNING);
        verify(conversationService, times(2)).streamMessage(
                anyString(), anyString(), any(), isNull(), any(), any(),
                anyString(), any(), any(), any()
        );
    }

    @Test
    void resumesAsANewTurnWithoutStartingTheOriginalMessageAgain() {
        ConversationService conversationService = mock(
                ConversationService.class
        );
        ConversationRunStore runStore = mock(ConversationRunStore.class);
        ConversationRunEventStreamRegistry streams = mock(
                ConversationRunEventStreamRegistry.class
        );
        Map<String, ConversationRun> runs = new LinkedHashMap<>();
        stubRunStore(runStore, runs);
        when(conversationService.pauseGeneration("task-1"))
                .thenReturn(true);
        List<Consumer<ChatStreamEvent>> eventConsumers = new ArrayList<>();
        List<Runnable> completions = new ArrayList<>();
        doAnswer(invocation -> {
            eventConsumers.add(invocation.getArgument(7));
            completions.add(invocation.getArgument(8));
            return null;
        }).when(conversationService).streamMessage(
                anyString(), anyString(), any(), any(), any(), any(),
                anyString(), any(), any(), any()
        );
        ConversationRunCoordinator coordinator = new ConversationRunCoordinator(
                conversationService,
                runStore,
                streams,
                mock(TaskService.class),
                Clock.fixed(
                        Instant.parse("2026-08-15T00:00:00Z"),
                        ZoneOffset.UTC
                ),
                1
        );

        ConversationRun run = coordinator.startMessage(
                "task-1", "完成全部步骤", null, null,
                null, null, "correlation-1"
        );

        assertThat(coordinator.pause("task-1", run.getRunId()).getStatus())
                .isEqualTo(ConversationRunStatus.PAUSING);
        eventConsumers.getFirst().accept(new ChatStreamEvent(
                ChatStreamEventType.PAUSED, "", "", null, ""
        ));
        assertThat(run.getStatus()).isEqualTo(ConversationRunStatus.PAUSING);
        completions.getFirst().run();
        assertThat(run.getStatus()).isEqualTo(ConversationRunStatus.PAUSED);

        assertThat(coordinator.resume("task-1", run.getRunId()).getStatus())
                .isEqualTo(ConversationRunStatus.RUNNING);

        verify(conversationService).pauseGeneration("task-1");
        verify(conversationService, times(1)).streamMessage(
                anyString(), anyString(), any(), any(), any(), any(),
                anyString(), any(), any(), any()
        );
        verify(conversationService).continueMessage(
                anyString(), any(), any(), any(), any(), anyString(),
                any(), any(), any()
        );
    }

    @Test
    void keepsARunResumableWhenItsPausingTurnFailsToSeal() {
        ConversationService conversationService = mock(
                ConversationService.class
        );
        ConversationRunStore runStore = mock(ConversationRunStore.class);
        ConversationRunEventStreamRegistry streams = mock(
                ConversationRunEventStreamRegistry.class
        );
        Map<String, ConversationRun> runs = new LinkedHashMap<>();
        stubRunStore(runStore, runs);
        when(conversationService.pauseGeneration("task-1"))
                .thenReturn(true);
        List<Consumer<Throwable>> failures = new ArrayList<>();
        doAnswer(invocation -> {
            failures.add(invocation.getArgument(9));
            return null;
        }).when(conversationService).streamMessage(
                anyString(), anyString(), any(), any(), any(), any(),
                anyString(), any(), any(), any()
        );
        ConversationRunCoordinator coordinator = new ConversationRunCoordinator(
                conversationService,
                runStore,
                streams,
                mock(TaskService.class),
                Clock.fixed(
                        Instant.parse("2026-08-15T00:00:00Z"),
                        ZoneOffset.UTC
                ),
                1
        );
        ConversationRun run = coordinator.startMessage(
                "task-1", "完成全部步骤", null, null,
                null, null, "correlation-1"
        );

        coordinator.pause("task-1", run.getRunId());
        failures.getFirst().accept(new IllegalStateException(
                "failed to persist paused turn"
        ));

        assertThat(run.getStatus()).isEqualTo(ConversationRunStatus.PAUSED);
        verify(conversationService).sealRecoveredTurn(
                anyString(), anyString(), any()
        );
        assertThat(coordinator.resume("task-1", run.getRunId()).getStatus())
                .isEqualTo(ConversationRunStatus.RUNNING);
    }

    @Test
    void repairsALegacyPauseSequenceFailureAfterRestart() {
        ConversationService conversationService = mock(
                ConversationService.class
        );
        ConversationRunStore runStore = mock(ConversationRunStore.class);
        ConversationRunEventStreamRegistry streams = mock(
                ConversationRunEventStreamRegistry.class
        );
        Map<String, ConversationRun> runs = new LinkedHashMap<>();
        stubRunStore(runStore, runs);
        ConversationRun run = new ConversationRun();
        run.setRunId("run-legacy");
        run.setTaskId("task-1");
        run.setStatus(ConversationRunStatus.FAILED);
        run.setTriggerType(ConversationRunTrigger.MESSAGE);
        run.setReplayFromSequence(0L);
        run.setStartedAt(Instant.parse("2026-08-15T00:00:00Z"));
        runs.put(run.getRunId(), run);
        ChatStreamEvent pausing = new ChatStreamEvent(
                ChatStreamEventType.PROGRESS_MESSAGE,
                "正在安全暂停任务",
                "demo",
                null,
                "",
                "run-lifecycle-1",
                "",
                "",
                "正在安全暂停任务",
                Map.of(),
                "",
                0L,
                null,
                Map.of("runStatus", "PAUSING")
        );
        when(runStore.listRecoverable()).thenReturn(List.of());
        when(runStore.listRepairablePauseFailures()).thenReturn(List.of(run));
        when(runStore.listChatEventsAfter("run-legacy", 0L))
                .thenReturn(List.of(pausing));
        when(runStore.markRecoveredPaused("run-legacy"))
                .thenAnswer(invocation -> {
                    run.setStatus(ConversationRunStatus.PAUSED);
                    run.setErrorMessage("");
                    return run;
                });
        ConversationRunCoordinator coordinator = new ConversationRunCoordinator(
                conversationService,
                runStore,
                streams,
                mock(TaskService.class),
                Clock.fixed(
                        Instant.parse("2026-08-15T00:00:00Z"),
                        ZoneOffset.UTC
                ),
                1
        );

        coordinator.recoverRunsAfterRestart();

        assertThat(run.getStatus()).isEqualTo(ConversationRunStatus.PAUSED);
        verify(conversationService).sealRecoveredTurn(
                "task-1", "run-legacy:0", List.of(pausing)
        );
        verify(runStore).markRecoveredPaused("run-legacy");
    }

    private void stubRunStore(
            ConversationRunStore store,
            Map<String, ConversationRun> runs
    ) {
        when(store.insert(any(ConversationRun.class))).thenAnswer(invocation -> {
            ConversationRun run = invocation.getArgument(0);
            runs.put(run.getRunId(), run);
            return run;
        });
        when(store.require(anyString())).thenAnswer(
                invocation -> runs.get(invocation.getArgument(0))
        );
        when(store.requireForTask(anyString(), anyString())).thenAnswer(
                invocation -> {
                    ConversationRun run = runs.get(invocation.getArgument(1));
                    return run != null
                            && run.getTaskId().equals(invocation.getArgument(0))
                            ? run
                            : null;
                }
        );
        when(store.findActiveForTask(anyString())).thenAnswer(invocation -> {
            String taskId = invocation.getArgument(0);
            return runs.values().stream()
                    .filter(run -> run.getTaskId().equals(taskId))
                    .filter(run -> run.getStatus().isActive())
                    .findFirst()
                    .orElse(null);
        });
        when(store.updateStatus(anyString(), any(), anyString()))
                .thenAnswer(invocation -> {
                    ConversationRun run = runs.get(invocation.getArgument(0));
                    run.setStatus(invocation.getArgument(1));
                    if (run.getStatus() == ConversationRunStatus.RUNNING
                            && run.getStartedAt() == null) {
                        run.setStartedAt(Instant.parse(
                                "2026-08-15T00:00:00Z"
                        ));
                    }
                    return run;
                });
        when(store.prepareResume(anyString())).thenAnswer(invocation -> {
            ConversationRun run = runs.get(invocation.getArgument(0));
            run.setReplayFromSequence(run.getLastEventSequence());
            if (run.getStartedAt() != null) {
                run.setTriggerType(ConversationRunTrigger.RESUME);
            }
            run.setStatus(ConversationRunStatus.QUEUED);
            return run;
        });
    }
}
