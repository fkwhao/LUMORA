package com.lumora.core.conversation.application.support;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lumora.core.conversation.domain.entity.ConversationRun;
import com.lumora.core.conversation.domain.entity.ConversationRunEvent;
import com.lumora.core.conversation.domain.model.ChatStreamEvent;
import com.lumora.core.conversation.domain.model.ChatStreamEventType;
import com.lumora.core.conversation.domain.model.ConversationRunEventEnvelope;
import com.lumora.core.conversation.infrastructure.persistence.ConversationRunEventMapper;
import com.lumora.core.conversation.infrastructure.persistence.ConversationRunMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ConversationRunStoreTest {

    @Test
    void findsTheLatestNonBlankWorkspaceForATask() {
        ConversationRunMapper runMapper = mock(ConversationRunMapper.class);
        ConversationRun blank = new ConversationRun();
        blank.setWorkspacePath("   ");
        ConversationRun latestWithWorkspace = new ConversationRun();
        latestWithWorkspace.setWorkspacePath(" F:\\project\\test ");
        ConversationRun older = new ConversationRun();
        older.setWorkspacePath("F:\\project\\older");
        when(runMapper.selectList(any())).thenReturn(List.of(
                blank, latestWithWorkspace, older
        ));
        ConversationRunStore store = new ConversationRunStore(
                runMapper,
                mock(ConversationRunEventMapper.class),
                mock(AgentSessionStore.class),
                mock(AgentWorkflowStore.class),
                new ObjectMapper(),
                mock(TransactionTemplate.class),
                Clock.systemUTC()
        );

        String workspacePath = store.findLatestWorkspacePathForTask("task-1");

        assertThat(workspacePath).isEqualTo("F:\\project\\test");
    }

    @Test
    void appendsAnOrderedBatchWithOneRunUpdate() {
        ConversationRunMapper runMapper = mock(ConversationRunMapper.class);
        ConversationRunEventMapper eventMapper = mock(
                ConversationRunEventMapper.class
        );
        TransactionTemplate transactionTemplate = mock(
                TransactionTemplate.class
        );
        when(transactionTemplate.execute(any())).thenAnswer(invocation -> {
            TransactionCallback<?> callback = invocation.getArgument(0);
            return callback.doInTransaction(mock(TransactionStatus.class));
        });
        ConversationRun run = new ConversationRun();
        run.setRunId("run-1");
        run.setLastEventSequence(4L);
        when(runMapper.selectById("run-1")).thenReturn(run);
        Clock clock = Clock.fixed(
                Instant.parse("2026-08-17T00:00:00Z"),
                ZoneOffset.UTC
        );
        ConversationRunStore store = new ConversationRunStore(
                runMapper,
                eventMapper,
                mock(AgentSessionStore.class),
                mock(AgentWorkflowStore.class),
                new ObjectMapper(),
                transactionTemplate,
                clock
        );
        ChatStreamEvent first = new ChatStreamEvent(
                ChatStreamEventType.TEXT_DELTA, "first", "demo", null, ""
        );
        ChatStreamEvent second = new ChatStreamEvent(
                ChatStreamEventType.TEXT_DELTA, "second", "demo", null, ""
        );

        List<ConversationRunEventEnvelope> envelopes = store.appendEvents(
                "run-1", List.of(first, second)
        );

        assertThat(envelopes).extracting(
                ConversationRunEventEnvelope::sequence
        ).containsExactly(5L, 6L);
        assertThat(envelopes).extracting(
                ConversationRunEventEnvelope::event
        ).containsExactly(first, second);
        ArgumentCaptor<ConversationRunEvent> storedEvents =
                ArgumentCaptor.forClass(ConversationRunEvent.class);
        verify(eventMapper, times(2)).insert(storedEvents.capture());
        assertThat(storedEvents.getAllValues()).extracting(
                ConversationRunEvent::getEventId
        ).containsExactly("run-1:5", "run-1:6");
        assertThat(run.getLastEventSequence()).isEqualTo(6L);
        assertThat(run.getUpdatedAt()).isEqualTo(clock.instant());
        verify(transactionTemplate).execute(any());
        verify(runMapper).updateById(run);
    }
}
