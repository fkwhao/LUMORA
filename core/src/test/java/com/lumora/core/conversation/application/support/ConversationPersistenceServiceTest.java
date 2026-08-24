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
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ConversationPersistenceServiceTest {

    @Test
    void persistsSteerAsAVisibleUserMessageAndAdvancesTheReplyParent() {
        ConversationMapper conversationMapper = mock(ConversationMapper.class);
        ConversationMessageMapper messageMapper = mock(
                ConversationMessageMapper.class
        );
        TransactionTemplate transactionTemplate = mock(
                TransactionTemplate.class
        );
        doAnswer(invocation -> {
            @SuppressWarnings("unchecked")
            Consumer<TransactionStatus> action = invocation.getArgument(0);
            action.accept(mock(TransactionStatus.class));
            return null;
        }).when(transactionTemplate).executeWithoutResult(any());
        Instant now = Instant.parse("2026-08-16T08:00:00Z");
        Conversation conversation = new Conversation(
                "conversation-1", "task-1", now, now
        );
        ConversationMessage parent = message(
                "user-1", 1, ChatMessageRole.USER, "检查项目", now
        );
        parent.setMessageDepth(1);
        parent.setActivePath(true);
        when(messageMapper.selectById("user-1")).thenReturn(parent);
        when(messageMapper.selectList(any())).thenReturn(List.of(parent));
        when(conversationMapper.selectById("conversation-1"))
                .thenReturn(conversation);
        ConversationPersistenceService service =
                new ConversationPersistenceService(
                        conversationMapper,
                        messageMapper,
                        mock(TaskService.class),
                        mock(MemoryService.class),
                        mock(ConversationContextSummaryService.class),
                        Clock.fixed(now, ZoneOffset.UTC),
                        transactionTemplate,
                        new ObjectMapper()
                );
        ConversationRunContext context = new ConversationRunContext(
                "task-1", "conversation-1", List.of(),
                "user-1", "检查项目", null, null, System.nanoTime()
        );

        service.persistSteerMessage(context, "改为先检查安全边界");

        ArgumentCaptor<ConversationMessage> captor =
                ArgumentCaptor.forClass(ConversationMessage.class);
        verify(messageMapper).insert(captor.capture());
        ConversationMessage saved = captor.getValue();
        assertThat(saved.getRole()).isEqualTo(ChatMessageRole.USER);
        assertThat(saved.getContent()).isEqualTo("改为先检查安全边界");
        assertThat(saved.getParentMessageId()).isEqualTo("user-1");
        assertThat(saved.getMessageDepth()).isEqualTo(2);
        assertThat(context.getAssistantParentMessageId())
                .isEqualTo(saved.getMessageId());
    }

    @Test
    void allocatesPausedAssistantSequenceAtPersistenceTime() {
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
        ConversationMessage supplementalUsage = new ConversationMessage(
                "usage-1",
                "conversation-1",
                2,
                ChatMessageRole.ASSISTANT,
                "",
                "demo-model",
                10,
                2,
                12,
                now
        );
        supplementalUsage.setUsageRecordOnly(true);
        when(messageMapper.selectById("user-1")).thenReturn(parent);
        when(messageMapper.selectList(any())).thenReturn(List.of(
                parent, supplementalUsage
        ));
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

        service.persistPausedTurn(context, accumulator, "run-1:0");

        ArgumentCaptor<ConversationMessage> captor =
                ArgumentCaptor.forClass(ConversationMessage.class);
        verify(messageMapper).insert(captor.capture());
        ConversationMessage saved = captor.getValue();
        assertThat(saved.getSequence()).isEqualTo(3);
        assertThat(saved.getRole()).isEqualTo(ChatMessageRole.ASSISTANT);
        assertThat(saved.isActivePath()).isTrue();
        assertThat(saved.isUsageRecordOnly()).isFalse();
        assertThat(saved.getParentMessageId()).isEqualTo("user-1");
        assertThat(saved.getTotalTokens()).isEqualTo(12);
        assertThat(saved.getWorkLogJson()).contains("progress-1");
        assertThat(saved.getWorkLogJson()).contains(
                RunProtocolContextCodec.markerItemId("run-1:0")
        );
    }

    @Test
    void restoresNativeAssistantAndToolMessagesForContinuation()
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
        TransactionTemplate transactionTemplate = mock(TransactionTemplate.class);
        doAnswer(invocation -> {
            TransactionCallback<?> callback = invocation.getArgument(0);
            return callback.doInTransaction(mock(TransactionStatus.class));
        }).when(transactionTemplate).execute(any());
        Instant now = Instant.parse("2026-08-16T08:00:00Z");
        ObjectMapper objectMapper = new ObjectMapper();
        Conversation conversation = new Conversation(
                "conversation-1", "task-1", now, now
        );
        ConversationMessage user = message(
                "user-1", 1, ChatMessageRole.USER, "检查并修复项目", now
        );
        user.setMessageDepth(1);
        user.setActivePath(true);
        ConversationMessage paused = message(
                "assistant-1", 2, ChatMessageRole.ASSISTANT,
                "正在运行测试。", now
        );
        paused.setParentMessageId("user-1");
        paused.setMessageDepth(2);
        paused.setActivePath(true);
        Map<String, Object> nativeInput = new LinkedHashMap<>();
        nativeInput.put("command", "mvn test");
        nativeInput.put("optional", null);
        nativeInput.put("items", Arrays.asList(null, "x"));
        Map<String, Object> nativeToolBlock = new LinkedHashMap<>();
        nativeToolBlock.put("type", "tool_use");
        nativeToolBlock.put("id", "call-1");
        nativeToolBlock.put("name", "shell_command");
        nativeToolBlock.put("input", nativeInput);
        paused.setWorkLogJson(objectMapper.writeValueAsString(List.of(
                RunProtocolContextCodec.marker("model", List.of(
                        Map.of(
                                "role", "assistant",
                                "content", "正在运行测试。",
                                "toolCalls", List.of(Map.of(
                                        "id", "call-1",
                                        "name", "shell_command",
                                        "arguments", "{\"command\":\"mvn test\"}"
                                )),
                                "providerState", Map.of(
                                        "apiFormat", "anthropic",
                                        "contentBlocks", List.of(
                                                Map.of(
                                                        "type", "thinking",
                                                        "thinking", "检查测试状态",
                                                        "signature", "signed"
                                                ),
                                                nativeToolBlock
                                        )
                                )
                        ),
                        Map.of(
                                "role", "tool",
                                "content", "BUILD SUCCESS",
                                "toolCallId", "call-1"
                        )
                ))
        )));
        when(conversationMapper.selectOne(any())).thenReturn(conversation);
        when(messageMapper.selectList(any())).thenReturn(List.of(user, paused));
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

        ConversationRunContext context = service.prepareContinuation(
                "task-1", null
        );

        assertThat(context.getModelMessages()).hasSize(4);
        assertThat(context.getModelMessages().get(1).getRole())
                .isEqualTo("assistant");
        assertThat(context.getModelMessages().get(1).getToolCalls())
                .singleElement()
                .satisfies(call -> {
                    assertThat(call.id()).isEqualTo("call-1");
                    assertThat(call.name()).isEqualTo("shell_command");
                });
        assertThat(context.getModelMessages().get(2).getRole())
                .isEqualTo("tool");
        assertThat(context.getModelMessages().get(2).getToolCallId())
                .isEqualTo("call-1");
        assertThat(context.getModelMessages().get(2).getContent())
                .isEqualTo("BUILD SUCCESS");
        assertThat(context.getModelMessages().get(1).getContent())
                .doesNotContain("<interrupted_agent_run>");
        assertThat(context.getModelMessages().get(1).getProviderState())
                .containsEntry("apiFormat", "anthropic")
                .containsKey("contentBlocks");
        List<?> restoredBlocks = (List<?>) context.getModelMessages().get(1)
                .getProviderState().get("contentBlocks");
        Map<?, ?> restoredToolBlock = (Map<?, ?>) restoredBlocks.get(1);
        Map<?, ?> restoredInput = (Map<?, ?>) restoredToolBlock.get("input");
        assertThat(restoredInput.containsKey("optional")).isTrue();
        assertThat(restoredInput.get("optional")).isNull();
        assertThat(restoredInput.get("items"))
                .isEqualTo(Arrays.asList(null, "x"));
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
