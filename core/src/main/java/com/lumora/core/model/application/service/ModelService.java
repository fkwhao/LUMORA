package com.lumora.core.model.application.service;

import com.lumora.core.conversation.domain.model.ChatCompletion;
import com.lumora.core.conversation.domain.model.ChatMessage;
import com.lumora.core.conversation.domain.model.ChatStreamEvent;
import com.lumora.core.model.domain.model.ModelSettings;
import com.lumora.core.model.domain.model.ModelProvider;
import com.lumora.core.model.domain.model.ProviderModel;
import com.lumora.core.conversation.domain.model.ContextCompaction;
import com.lumora.core.memory.domain.model.MemoryContextItem;
import com.lumora.core.agent.model.AgentMemoryCandidate;

import java.util.List;
import java.util.function.Consumer;

/**
 * 模型配置和模型调用的统一业务接口。
 */
public interface ModelService {

    List<ModelProvider> listProviders(String correlationId);

    ModelProvider createProvider(String providerName, String baseUrl,
            String model, int contextWindow, String apiFormat, String apiKey,
            String correlationId);

    ModelProvider updateProvider(String providerId, String providerName,
            String baseUrl, String model, int contextWindow, String apiFormat,
            String apiKey, String correlationId);

    ModelProvider activateProvider(String providerId, String correlationId);

    ModelProvider disableProvider(String providerId, String correlationId);

    void deleteProvider(String providerId, String correlationId);

    List<String> listProviderModels(String providerId, String apiKey,
            String correlationId);

    ProviderModel createProviderModel(String providerId, String modelId,
            int contextWindow, int maxOutputTokens,
            List<String> reasoningEfforts, String correlationId);

    ProviderModel updateProviderModel(String providerId, String modelConfigurationId,
            String modelId, int contextWindow, int maxOutputTokens,
            List<String> reasoningEfforts, String correlationId);

    void deleteProviderModel(String providerId, String modelConfigurationId,
            String correlationId);

    boolean testProviderModel(String providerId, String modelConfigurationId,
            String correlationId);

    void decideToolApproval(
            String approvalId,
            String decision,
            String correlationId
    );

    List<String> listModels(
            String providerName,
            String baseUrl,
            String apiKey,
            String correlationId
    );

    List<AgentMemoryCandidate> extractMemories(
            String userMessage,
            String assistantMessage,
            String existingMemorySummary,
            String correlationId
    );

    default List<AgentMemoryCandidate> extractMemories(
            String userMessage,
            String assistantMessage,
            String existingMemorySummary,
            String workspacePath,
            String correlationId
    ) {
        return extractMemories(userMessage, assistantMessage,
                existingMemorySummary, correlationId);
    }

    /**
     * 获取可安全返回给前端的模型配置。
     *
     * @param correlationId 全链路关联 ID
     * @return 不包含 API Key 明文或密文的模型配置
     */
    ModelSettings getSettings(String correlationId);

    /**
     * 校验并保存本地模型配置。
     *
     * <p>API Key 留空表示保留原 Key；首次配置时必须提供。Key 由平台安全组件
     * 加密后再写入数据库，不会出现在返回值中。</p>
     *
     * @param providerName 模型供应商显示名称
     * @param baseUrl 兼容接口基础地址
     * @param model 模型名称
     * @param apiKey 新 API Key，留空时保留现有值
     * @param correlationId 全链路关联 ID
     * @return 脱敏后的最新配置
     * @throws IllegalArgumentException 配置格式无效
     */
    ModelSettings updateSettings(
            String providerName,
            String baseUrl,
            String model,
            int contextWindow,
            String apiKey,
            String correlationId
    );

    /**
     * 执行一次非流式模型对话。
     *
     * @param messages 已按时间排序的模型上下文
     * @param correlationId 全链路关联 ID
     * @return 完整模型回答及 Token 用量
     * @throws IllegalStateException 尚未配置可用模型
     */
    ChatCompletion completeChat(
            List<ChatMessage> messages,
            String correlationId
    );

    ContextCompaction compactContext(
            List<ChatMessage> messages,
            String memorySummary,
            String taskId,
            String conversationSummary,
            String model,
            String correlationId
    );

    /**
     * 执行一次流式模型对话。
     *
     * <p>事件按照 Python Agent 返回顺序同步交给消费者；结束与失败也通过
     * {@link ChatStreamEvent} 表达。</p>
     *
     * @param messages 已按时间排序的模型上下文
     * @param correlationId 全链路关联 ID
     * @param eventConsumer 流事件处理器
     * @throws IllegalStateException 尚未配置可用模型
     */
    void streamChat(
            List<ChatMessage> messages,
            String correlationId,
            String model,
            String reasoningEffort,
            String memorySummary,
            String workspacePath,
            Consumer<ChatStreamEvent> eventConsumer
    );

    default void streamChat(
            List<ChatMessage> messages,
            String correlationId,
            String model,
            String reasoningEffort,
            String memorySummary,
            String workspacePath,
            String permissionMode,
            Consumer<ChatStreamEvent> eventConsumer
    ) {
        streamChat(
                messages,
                correlationId,
                model,
                reasoningEffort,
                memorySummary,
                workspacePath,
                eventConsumer
        );
    }

    default void streamChat(
            List<ChatMessage> messages,
            String correlationId,
            String model,
            String reasoningEffort,
            String memorySummary,
            String workspacePath,
            String permissionMode,
            String taskId,
            String conversationSummary,
            Consumer<ChatStreamEvent> eventConsumer
    ) {
        streamChat(messages, correlationId, model, reasoningEffort,
                memorySummary, workspacePath, permissionMode, eventConsumer);
    }

    default void streamChat(
            List<ChatMessage> messages,
            String correlationId,
            String model,
            String reasoningEffort,
            String memorySummary,
            String workspacePath,
            String permissionMode,
            String taskId,
            String conversationSummary,
            List<MemoryContextItem> memoryCandidates,
            Consumer<ChatStreamEvent> eventConsumer
    ) {
        streamChat(messages, correlationId, model, reasoningEffort,
                memorySummary, workspacePath, permissionMode, taskId,
                conversationSummary, eventConsumer);
    }
}
