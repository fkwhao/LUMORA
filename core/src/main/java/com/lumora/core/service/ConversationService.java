package com.lumora.core.service;

import com.lumora.core.entity.ConversationMessage;
import com.lumora.core.model.ChatStreamEvent;

import java.util.List;
import java.util.function.Consumer;

/**
 * 会话业务入口，统一管理消息历史、流式生成和重新生成。
 */
public interface ConversationService {

    /**
     * 按消息序号查询任务的完整会话历史。
     *
     * @param taskId 任务 ID
     * @return 不可变的消息列表；任务尚无会话时返回空列表
     */
    List<ConversationMessage> listMessages(String taskId);

    /**
     * 保存新的用户消息，并异步流式生成助手回答。
     *
     * <p>同一任务同一时间只允许存在一个生成流程。事件回调可能由工作线程调用，
     * 调用方不得假设它运行在 HTTP 请求线程。</p>
     *
     * @param taskId 任务 ID
     * @param content 用户消息
     * @param correlationId 全链路关联 ID
     * @param eventConsumer 单个流事件处理器
     * @param completionCallback 正常结束回调
     * @param errorCallback 异常结束回调
     * @throws IllegalArgumentException 请求参数无效
     * @throws IllegalStateException 当前任务已有生成流程
     */
    void streamMessage(
            String taskId,
            String content,
            String correlationId,
            Consumer<ChatStreamEvent> eventConsumer,
            Runnable completionCallback,
            Consumer<Throwable> errorCallback
    );

    /**
     * 编辑最后一条用户消息，并用新回答替换它之后的旧回答。
     *
     * @param taskId 任务 ID
     * @param messageId 待编辑的用户消息 ID
     * @param content 编辑后的消息内容
     * @param correlationId 全链路关联 ID
     * @param eventConsumer 单个流事件处理器
     * @param completionCallback 正常结束回调
     * @param errorCallback 异常结束回调
     * @throws IllegalArgumentException 消息不存在或不是最后一条用户消息
     * @throws IllegalStateException 当前任务已有生成流程
     */
    void regenerateMessage(
            String taskId,
            String messageId,
            String content,
            String correlationId,
            Consumer<ChatStreamEvent> eventConsumer,
            Runnable completionCallback,
            Consumer<Throwable> errorCallback
    );
}
