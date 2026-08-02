package com.lumora.core.service.impl;

import com.lumora.core.entity.ConversationMessage;
import com.lumora.core.model.ChatStreamEvent;
import com.lumora.core.model.ChatStreamEventType;
import com.lumora.core.service.ConversationService;
import com.lumora.core.service.ModelService;
import com.lumora.core.service.support.conversation.ConversationPersistenceService;
import com.lumora.core.service.support.conversation.ConversationRunContext;
import com.lumora.core.service.support.conversation.ConversationStreamAccumulator;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.function.Consumer;
import java.util.function.Supplier;

/**
 * 会话业务编排器。
 *
 * <p>本类只管理生成流程和同任务并发约束；数据库事务由
 * {@link ConversationPersistenceService} 负责。</p>
 */
@Service
@RequiredArgsConstructor
public class ConversationServiceImpl implements ConversationService {

    private final ConversationPersistenceService persistenceService;
    private final ModelService modelService;
    private final ExecutorService executorService;
    private final Set<String> activeTaskIds = ConcurrentHashMap.newKeySet();

    @Override
    public List<ConversationMessage> listMessages(String taskId) {
        return persistenceService.listMessages(taskId);
    }

    @Override
    public void streamMessage(
            String taskId,
            String content,
            String correlationId,
            Consumer<ChatStreamEvent> eventConsumer,
            Runnable completionCallback,
            Consumer<Throwable> errorCallback
    ) {
        String normalizedContent = requireText(content, "消息内容");
        startGeneration(
                taskId,
                requireText(correlationId, "关联 ID"),
                () -> persistenceService.prepareNewMessage(
                        taskId,
                        normalizedContent
                ),
                eventConsumer,
                completionCallback,
                errorCallback
        );
    }

    @Override
    public void regenerateMessage(
            String taskId,
            String messageId,
            String content,
            String correlationId,
            Consumer<ChatStreamEvent> eventConsumer,
            Runnable completionCallback,
            Consumer<Throwable> errorCallback
    ) {
        String normalizedMessageId = requireText(messageId, "消息 ID");
        String normalizedContent = requireText(content, "消息内容");
        startGeneration(
                taskId,
                requireText(correlationId, "关联 ID"),
                () -> persistenceService.prepareRegeneration(
                        taskId,
                        normalizedMessageId,
                        normalizedContent
                ),
                eventConsumer,
                completionCallback,
                errorCallback
        );
    }

    private void startGeneration(
            String taskId,
            String correlationId,
            Supplier<ConversationRunContext> contextSupplier,
            Consumer<ChatStreamEvent> eventConsumer,
            Runnable completionCallback,
            Consumer<Throwable> errorCallback
    ) {
        if (!activeTaskIds.add(taskId)) {
            throw new IllegalStateException("当前任务正在生成回复");
        }

        try {
            ConversationRunContext context = contextSupplier.get();
            executorService.submit(() -> executeStream(
                    context,
                    correlationId,
                    eventConsumer,
                    completionCallback,
                    errorCallback
            ));
        } catch (RuntimeException error) {
            activeTaskIds.remove(taskId);
            throw error;
        }
    }

    private void executeStream(
            ConversationRunContext context,
            String correlationId,
            Consumer<ChatStreamEvent> eventConsumer,
            Runnable completionCallback,
            Consumer<Throwable> errorCallback
    ) {
        ConversationStreamAccumulator accumulator =
                new ConversationStreamAccumulator();
        try {
            modelService.streamChat(
                    context.getModelMessages(),
                    correlationId,
                    event -> handleStreamEvent(
                            context,
                            accumulator,
                            event,
                            eventConsumer
                    )
            );
            if (!accumulator.isCompleted()) {
                throw new IllegalStateException("模型流未正常结束");
            }
            completionCallback.run();
        } catch (Throwable error) {
            errorCallback.accept(error);
        } finally {
            activeTaskIds.remove(context.getTaskId());
        }
    }

    private void handleStreamEvent(
            ConversationRunContext context,
            ConversationStreamAccumulator accumulator,
            ChatStreamEvent event,
            Consumer<ChatStreamEvent> eventConsumer
    ) {
        accumulator.accept(event);
        if (event.getType() == ChatStreamEventType.COMPLETED) {
            persistenceService.persistAssistant(context, accumulator);
        }
        eventConsumer.accept(event);
    }

    private String requireText(String value, String label) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(label + "不能为空");
        }
        return value.trim();
    }
}
