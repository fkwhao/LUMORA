package com.lumora.core.agent.client;

import com.lumora.core.agent.model.AgentPlanStep;
import com.lumora.core.model.ChatCompletion;
import com.lumora.core.model.ChatMessage;
import com.lumora.core.model.ChatStreamEvent;
import com.lumora.core.model.ModelConnection;

import java.util.List;
import java.util.function.Consumer;

/**
 * Service 调用 Python Agent 的稳定接口，业务层不依赖 HTTP DTO。
 */
public interface AgentRuntimeClient {

    /**
     * 请求 Python Agent 为任务生成初始计划。
     *
     * @param taskId Java 侧预先生成的任务 ID
     * @param goal 用户任务目标
     * @param correlationId 全链路关联 ID
     * @return 按执行顺序排列的计划步骤
     */
    List<AgentPlanStep> planTask(
            String taskId,
            String goal,
            String correlationId
    );

    /**
     * 通过 Python Agent 执行一次非流式模型对话。
     *
     * @param messages 模型上下文
     * @param connection 仅在当前调用内使用的模型连接信息
     * @param correlationId 全链路关联 ID
     * @return 完整模型回答
     */
    ChatCompletion completeChat(
            List<ChatMessage> messages,
            ModelConnection connection,
            String correlationId
    );

    /**
     * 通过 Python Agent 执行流式模型对话。
     *
     * <p>模型连接中的 API Key 不会写入 HTTP 日志，Python 只在当前请求内
     * 保存在内存中。</p>
     *
     * @param messages 模型上下文
     * @param connection 模型连接信息
     * @param correlationId 全链路关联 ID
     * @param eventConsumer 按返回顺序接收标准化流事件
     */
    void streamChat(
            List<ChatMessage> messages,
            ModelConnection connection,
            String correlationId,
            Consumer<ChatStreamEvent> eventConsumer
    );
}
