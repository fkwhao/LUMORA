package com.lumora.core.conversation.application.service.impl;

import com.lumora.core.conversation.application.model.ConversationRunRequest;
import com.lumora.core.conversation.application.port.ContextCompactionPort;
import com.lumora.core.conversation.application.port.ConversationRuntimePort;
import com.lumora.core.conversation.application.port.ToolApprovalPort;
import com.lumora.core.conversation.application.service.ArtifactService;
import com.lumora.core.conversation.application.support.ConversationContextSummaryService;
import com.lumora.core.conversation.application.support.ConversationPersistenceService;
import com.lumora.core.conversation.application.support.ConversationRunContext;
import com.lumora.core.conversation.application.support.ConversationStreamAccumulator;
import com.lumora.core.conversation.domain.model.ChatMessage;
import com.lumora.core.conversation.domain.model.ChatStreamEvent;
import com.lumora.core.conversation.domain.model.ChatStreamEventType;
import com.lumora.core.conversation.domain.model.TokenUsage;
import com.lumora.core.memory.application.service.MemoryService;
import com.lumora.core.memory.application.support.MemoryExtractionCoordinator;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ConversationFailedUsageServiceTest {

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @AfterEach
    void tearDown() {
        executor.shutdownNow();
    }

    @Test
    void persistsLatestReportedUsageWhenTheStreamFails() throws Exception {
        ConversationPersistenceService persistence = mock(
                ConversationPersistenceService.class
        );
        ConversationRuntimePort runtime = mock(ConversationRuntimePort.class);
        ConversationRunContext context = new ConversationRunContext(
                "task-1",
                "conversation-1",
                2,
                List.of(new ChatMessage("user", "hello")),
                "message-1",
                "hello",
                null,
                null,
                System.nanoTime()
        );
        when(persistence.prepareNewMessage("task-1", "hello", null))
                .thenReturn(context);
        doAnswer(invocation -> {
            @SuppressWarnings("unchecked")
            java.util.function.Consumer<ChatStreamEvent> consumer =
                    invocation.getArgument(1);
            consumer.accept(usageEvent(new TokenUsage(10, 2, 12)));
            consumer.accept(usageEvent(new TokenUsage(30, 5, 35)));
            throw new IllegalStateException("connection lost");
        }).when(runtime).streamChat(any(ConversationRunRequest.class), any());
        CountDownLatch failed = new CountDownLatch(1);
        ConversationServiceImpl service = new ConversationServiceImpl(
                persistence,
                runtime,
                mock(ContextCompactionPort.class),
                mock(ToolApprovalPort.class),
                executor,
                mock(MemoryExtractionCoordinator.class),
                mock(ConversationContextSummaryService.class),
                mock(ArtifactService.class),
                mock(MemoryService.class)
        );

        service.streamMessage(
                "task-1",
                "hello",
                null,
                null,
                null,
                "request_approval",
                "correlation-1",
                event -> { },
                () -> { },
                error -> failed.countDown()
        );

        assertTrue(failed.await(5, TimeUnit.SECONDS));
        ArgumentCaptor<ConversationStreamAccumulator> captor =
                ArgumentCaptor.forClass(ConversationStreamAccumulator.class);
        verify(persistence).persistFailedUsage(eq(context), captor.capture());
        assertThat(captor.getValue().getUsage().getTotalTokens()).isEqualTo(35);
    }

    private static ChatStreamEvent usageEvent(TokenUsage usage) {
        return new ChatStreamEvent(
                ChatStreamEventType.USAGE,
                "",
                "demo",
                usage,
                ""
        );
    }
}
