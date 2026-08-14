package com.lumora.core.conversation.application.support;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lumora.core.conversation.domain.entity.Conversation;
import com.lumora.core.conversation.domain.entity.ConversationMessage;
import com.lumora.core.conversation.domain.model.ChatMessageRole;
import com.lumora.core.conversation.domain.model.ChatStreamEvent;
import com.lumora.core.conversation.domain.model.ChatStreamEventType;
import com.lumora.core.conversation.domain.model.TokenUsage;
import com.lumora.core.conversation.infrastructure.persistence.ConversationMapper;
import com.lumora.core.conversation.infrastructure.persistence.ConversationMessageMapper;
import com.lumora.core.memory.application.service.MemoryService;
import com.lumora.core.task.application.service.TaskService;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ConversationPersistenceServiceTest {

    @Test
    void persistsInterruptedStepsAsAVisibleAssistantMessage() {
        ConversationMapper conversationMapper = mock(ConversationMapper.class);
        ConversationMessageMapper messageMapper = mock(
                ConversationMessageMapper.class
        );
        TaskService taskService = mock(TaskService.class);
        TransactionTemplate transactionTemplate = mock(
                TransactionTemplate.class
        );
        doAnswer(invocation -> {
            @SuppressWarnings("unchecked")
            Consumer<TransactionStatus> action = invocation.getArgument(0);
            action.accept(mock(TransactionStatus.class));
            return null;
        }).when(transactionTemplate).executeWithoutResult(any());
        Instant now = Instant.parse("2026-08-14T08:00:00Z");
        Conversation conversation = new Conversation(
                "conversation-1", "task-1", now, now
        );
        ConversationMessage parent = new ConversationMessage(
                "user-1",
                "conversation-1",
                1,
                ChatMessageRole.USER,
                "hello",
                "",
                0,
                0,
                0,
                now
        );
        parent.setMessageDepth(1);
        when(messageMapper.selectById("user-1")).thenReturn(parent);
        when(conversationMapper.selectById("conversation-1"))
                .thenReturn(conversation);
        ConversationPersistenceService service =
                new ConversationPersistenceService(
                        conversationMapper,
                        messageMapper,
                        taskService,
                        mock(MemoryService.class),
                        mock(ConversationContextSummaryService.class),
                        Clock.fixed(now, ZoneOffset.UTC),
                        transactionTemplate,
                        new ObjectMapper()
                );
        ConversationRunContext context = new ConversationRunContext(
                "task-1",
                "conversation-1",
                2,
                List.of(),
                "user-1",
                "hello",
                null,
                null,
                System.nanoTime()
        );
        ConversationStreamAccumulator accumulator =
                new ConversationStreamAccumulator();
        accumulator.accept(new ChatStreamEvent(
                ChatStreamEventType.PROGRESS_MESSAGE,
                "正在检查项目",
                "demo-model",
                null,
                "",
                "progress-1",
                "",
                "",
                "正在检查项目",
                Map.of(),
                "",
                0L,
                null,
                Map.of()
        ));
        accumulator.accept(new ChatStreamEvent(
                ChatStreamEventType.USAGE,
                "",
                "demo-model",
                new TokenUsage(10, 2, 12),
                ""
        ));

        service.persistFailedUsage(context, accumulator);

        ArgumentCaptor<ConversationMessage> captor =
                ArgumentCaptor.forClass(ConversationMessage.class);
        verify(messageMapper).insert(captor.capture());
        ConversationMessage saved = captor.getValue();
        assertThat(saved.getSequence()).isEqualTo(2);
        assertThat(saved.getRole()).isEqualTo(ChatMessageRole.ASSISTANT);
        assertThat(saved.isActivePath()).isTrue();
        assertThat(saved.isUsageRecordOnly()).isFalse();
        assertThat(saved.getParentMessageId()).isEqualTo("user-1");
        assertThat(saved.getTotalTokens()).isEqualTo(12);
        assertThat(saved.getWorkLogJson()).contains("progress-1");
        assertThat(saved.getWorkLogJson()).contains(
                InterruptedRunContextRenderer.MARKER_ITEM_ID
        );
    }

    @Test
    void includesInterruptedExecutionHistoryInTheNextModelContext()
            throws Exception {
        ConversationMapper conversationMapper = mock(ConversationMapper.class);
        ConversationMessageMapper messageMapper = mock(
                ConversationMessageMapper.class
        );
        TaskService taskService = mock(TaskService.class);
        MemoryService memoryService = mock(MemoryService.class);
        ConversationContextSummaryService summaryService = mock(
                ConversationContextSummaryService.class
        );
        TransactionTemplate transactionTemplate = mock(
                TransactionTemplate.class
        );
        doAnswer(invocation -> {
            TransactionCallback<?> callback = invocation.getArgument(0);
            return callback.doInTransaction(mock(TransactionStatus.class));
        }).when(transactionTemplate).execute(any());
        Instant now = Instant.parse("2026-08-14T08:00:00Z");
        ObjectMapper objectMapper = new ObjectMapper();
        Conversation conversation = new Conversation(
                "conversation-1", "task-1", now, now
        );
        ConversationMessage firstUser = message(
                "user-1", 1, ChatMessageRole.USER, "检查项目", now
        );
        firstUser.setMessageDepth(1);
        firstUser.setActivePath(true);
        ConversationMessage interruptedAssistant = message(
                "assistant-1", 2, ChatMessageRole.ASSISTANT, "", now
        );
        interruptedAssistant.setParentMessageId("user-1");
        interruptedAssistant.setMessageDepth(2);
        interruptedAssistant.setActivePath(true);
        interruptedAssistant.setWorkLogJson(objectMapper.writeValueAsString(
                List.of(
                        new ChatStreamEvent(
                                ChatStreamEventType.TOOL_COMPLETED,
                                "",
                                "model",
                                null,
                                "",
                                "tool-1",
                                "call-1",
                                "shell_command",
                                "运行测试",
                                Map.of("command", "mvn test"),
                                "BUILD SUCCESS",
                                100L,
                                0,
                                Map.of()
                        ),
                        InterruptedRunContextRenderer.marker("model")
                )
        ));
        when(conversationMapper.selectOne(any())).thenReturn(conversation);
        when(messageMapper.selectList(any())).thenReturn(List.of(
                firstUser,
                interruptedAssistant
        ));
        when(memoryService.buildPromptCandidates("conversation-1", null))
                .thenReturn(List.of());
        ConversationPersistenceService service =
                new ConversationPersistenceService(
                        conversationMapper,
                        messageMapper,
                        taskService,
                        memoryService,
                        summaryService,
                        Clock.fixed(now, ZoneOffset.UTC),
                        transactionTemplate,
                        objectMapper
                );

        ConversationRunContext context = service.prepareNewMessage(
                "task-1",
                "继续完成",
                null
        );

        assertThat(context.getModelMessages()).hasSize(3);
        assertThat(context.getModelMessages().get(1).getRole())
                .isEqualTo("assistant");
        assertThat(context.getModelMessages().get(1).getContent()).contains(
                "上一轮 Agent 在完成前被中断",
                "运行测试",
                "mvn test",
                "BUILD SUCCESS"
        );
        assertThat(context.getModelMessages().get(2).getContent())
                .isEqualTo("继续完成");
    }

    private static ConversationMessage message(
            String id,
            int sequence,
            ChatMessageRole role,
            String content,
            Instant now
    ) {
        return new ConversationMessage(
                id,
                "conversation-1",
                sequence,
                role,
                content,
                "",
                0,
                0,
                0,
                now
        );
    }
}
