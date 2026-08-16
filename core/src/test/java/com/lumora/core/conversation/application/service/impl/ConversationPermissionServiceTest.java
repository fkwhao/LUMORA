package com.lumora.core.conversation.application.service.impl;

import com.lumora.core.conversation.application.service.impl.ConversationServiceImpl;
import com.lumora.core.conversation.domain.model.ChatMessage;
import com.lumora.core.conversation.domain.model.ChatStreamEvent;
import com.lumora.core.conversation.domain.model.ChatStreamEventType;
import com.lumora.core.conversation.application.service.ArtifactService;
import com.lumora.core.conversation.application.model.ConversationRunRequest;
import com.lumora.core.conversation.application.port.ContextCompactionPort;
import com.lumora.core.conversation.application.port.ConversationRuntimePort;
import com.lumora.core.conversation.application.port.ToolApprovalPort;
import com.lumora.core.memory.application.service.MemoryService;
import com.lumora.core.conversation.application.support.ConversationContextSummaryService;
import com.lumora.core.conversation.application.support.ConversationPersistenceService;
import com.lumora.core.conversation.application.support.ConversationRunContext;
import com.lumora.core.memory.application.support.MemoryExtractionCoordinator;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ConversationPermissionServiceTest {

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @AfterEach
    void tearDown() {
        executor.shutdownNow();
    }

    @Test
    void bindsPendingApprovalToTaskAndOriginalCorrelationId() throws Exception {
        ConversationPersistenceService persistence = mock(
                ConversationPersistenceService.class
        );
        ConversationRuntimePort conversationRuntime = mock(
                ConversationRuntimePort.class
        );
        ContextCompactionPort contextCompactionPort = mock(
                ContextCompactionPort.class
        );
        ToolApprovalPort toolApprovalPort = mock(ToolApprovalPort.class);
        MemoryExtractionCoordinator memoryCoordinator = mock(
                MemoryExtractionCoordinator.class
        );
        ConversationRunContext context = new ConversationRunContext(
                "task-1",
                "conversation-1",
                List.of(new ChatMessage("user", "检查仓库")),
                "message-1",
                "检查仓库",
                null,
                null,
                System.nanoTime()
        );
        when(persistence.prepareNewMessage(
                "task-1", "检查仓库", "F:/project/demo"
        ))
                .thenReturn(context);

        CountDownLatch approvalPublished = new CountDownLatch(1);
        CountDownLatch approvalDecided = new CountDownLatch(1);
        CountDownLatch completed = new CountDownLatch(1);
        doAnswer(invocation -> {
            @SuppressWarnings("unchecked")
            java.util.function.Consumer<ChatStreamEvent> consumer =
                    invocation.getArgument(1);
            consumer.accept(approvalRequested());
            approvalPublished.countDown();
            assertTrue(approvalDecided.await(5, TimeUnit.SECONDS));
            consumer.accept(approvalResolved());
            consumer.accept(new ChatStreamEvent(
                    ChatStreamEventType.COMPLETED,
                    "",
                    "demo",
                    null,
                    ""
            ));
            return null;
        }).when(conversationRuntime).streamChat(
                any(ConversationRunRequest.class), any()
        );
        doAnswer(invocation -> {
            approvalDecided.countDown();
            return null;
        }).when(toolApprovalPort).decideToolApproval(
                anyString(),
                anyString(),
                anyString()
        );
        ConversationServiceImpl service = new ConversationServiceImpl(
                persistence,
                conversationRuntime,
                contextCompactionPort,
                toolApprovalPort,
                executor,
                memoryCoordinator,
                mock(ConversationContextSummaryService.class),
                mock(ArtifactService.class),
                mock(MemoryService.class)
        );

        service.streamMessage(
                "task-1",
                "检查仓库",
                null,
                null,
                "F:/project/demo",
                "request_approval",
                "correlation-original",
                event -> { },
                completed::countDown,
                error -> { throw new AssertionError(error); }
        );

        assertTrue(approvalPublished.await(5, TimeUnit.SECONDS));
        assertThrows(
                IllegalArgumentException.class,
                () -> service.decideToolApproval(
                        "task-2",
                        "approval-1",
                        "allow_once"
                )
        );
        service.decideToolApproval(
                "task-1",
                "approval-1",
                "allow_once"
        );

        verify(toolApprovalPort).decideToolApproval(
                "approval-1",
                "allow_once",
                "correlation-original"
        );
        assertTrue(completed.await(5, TimeUnit.SECONDS));
    }

    private static ChatStreamEvent approvalRequested() {
        return new ChatStreamEvent(
                ChatStreamEventType.TOOL_APPROVAL_REQUESTED,
                "",
                "demo",
                null,
                "",
                "item-1",
                "call-1",
                "shell_command",
                "git status",
                Map.of("command", "git status"),
                "",
                0L,
                null,
                Map.of(),
                "approval-1",
                "mode",
                "需要确认",
                "MEDIUM",
                true,
                ""
        );
    }

    private static ChatStreamEvent approvalResolved() {
        return new ChatStreamEvent(
                ChatStreamEventType.TOOL_APPROVAL_RESOLVED,
                "",
                "demo",
                null,
                "",
                "item-1",
                "call-1",
                "shell_command",
                "git status",
                Map.of("command", "git status"),
                "",
                0L,
                null,
                Map.of(),
                "approval-1",
                "mode",
                "需要确认",
                "MEDIUM",
                true,
                "allow"
        );
    }
}
