package com.lumora.core.service.impl;

import com.lumora.core.agent.client.AgentRuntimeClient;
import com.lumora.core.agent.model.AgentMemoryCandidate;
import com.lumora.core.common.constant.ModelConfigurationConstants;
import com.lumora.core.entity.ModelConfiguration;
import com.lumora.core.mapper.ModelConfigurationMapper;
import com.lumora.core.model.ChatCompletion;
import com.lumora.core.model.ChatMessage;
import com.lumora.core.model.ChatStreamEvent;
import com.lumora.core.model.ModelConnection;
import com.lumora.core.model.ModelSettings;
import com.lumora.core.security.secret.SecretProtector;
import com.lumora.core.service.ModelService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.function.Consumer;

/**
 * 模型配置与模型调用的业务入口。
 *
 * <p>API Key 只以受保护密文落库；调用 Agent 时才在当前进程内短暂解密。</p>
 */
@Service
@RequiredArgsConstructor
public class ModelServiceImpl implements ModelService {

    private final ModelConfigurationMapper configurationMapper;
    private final SecretProtector secretProtector;
    private final AgentRuntimeClient agentRuntimeClient;
    private final Clock clock;

    @Override
    public List<String> listModels(
            String providerName,
            String baseUrl,
            String apiKey,
            String correlationId
    ) {
        requireText(correlationId, "关联 ID");
        String normalizedProvider = requireText(providerName, "模型供应商");
        String normalizedBaseUrl = validateBaseUrl(baseUrl);
        String normalizedApiKey = apiKey == null ? "" : apiKey.trim();
        if (normalizedApiKey.isEmpty()) {
            ModelConfiguration existing = loadConfiguration();
            if (!hasEncryptedApiKey(existing)) {
                throw new IllegalArgumentException("请先输入 API Key");
            }
            normalizedApiKey = secretProtector.unprotect(
                    existing.getApiKeyCiphertext()
            );
        }
        return agentRuntimeClient.listModels(
                normalizedProvider,
                normalizedBaseUrl,
                normalizedApiKey,
                correlationId
        );
    }

    @Override
    public List<AgentMemoryCandidate> extractMemories(
            String userMessage,
            String assistantMessage,
            String existingMemorySummary,
            String correlationId
    ) {
        return agentRuntimeClient.extractMemories(
                requireText(userMessage, "用户消息"),
                requireText(assistantMessage, "助手回答"),
                existingMemorySummary,
                requireConnection(),
                requireText(correlationId, "关联 ID")
        );
    }

    @Override
    public ModelSettings getSettings(String correlationId) {
        requireText(correlationId, "关联 ID");
        ModelConfiguration configuration = loadConfiguration();
        if (configuration == null) {
            return new ModelSettings(
                    "OpenAI Compatible",
                    "https://api.openai.com/v1",
                    "",
                    128_000,
                    false
            );
        }
        return toPublicSettings(configuration);
    }

    @Override
    @Transactional
    public ModelSettings updateSettings(
            String providerName,
            String baseUrl,
            String model,
            int contextWindow,
            String apiKey,
            String correlationId
    ) {
        // 1. 先完成所有输入校验，避免无效配置进入数据库。
        requireText(correlationId, "关联 ID");
        String normalizedProvider = requireText(providerName, "模型供应商");
        String normalizedBaseUrl = validateBaseUrl(baseUrl);
        String normalizedModel = requireText(model, "模型名称");
        if (contextWindow < 1 || contextWindow > 10_000_000) {
            throw new IllegalArgumentException("上下文长度必须在 1 到 10000000 之间");
        }
        String normalizedApiKey = apiKey == null ? "" : apiKey.trim();

        // 2. 留空表示保留已有 Key；输入新 Key 时才执行 DPAPI 加密。
        ModelConfiguration existing = loadConfiguration();
        String apiKeyCiphertext = resolveApiKeyCiphertext(
                existing,
                normalizedApiKey
        );

        // 3. 单配置模式下执行新增或更新，并只向前端返回脱敏信息。
        Instant now = clock.instant();
        saveConfiguration(
                existing,
                normalizedProvider,
                normalizedBaseUrl,
                normalizedModel,
                contextWindow,
                apiKeyCiphertext,
                now
        );
        return toPublicSettings(loadConfiguration());
    }

    private String resolveApiKeyCiphertext(
            ModelConfiguration existing,
            String apiKey
    ) {
        if (apiKey.isEmpty()) {
            if (!hasEncryptedApiKey(existing)) {
                throw new IllegalArgumentException("首次配置必须提供 API Key");
            }
            return existing.getApiKeyCiphertext();
        }
        if (apiKey.length() > ModelConfigurationConstants.MAX_API_KEY_LENGTH) {
            throw new IllegalArgumentException("API Key 长度超过限制");
        }
        return secretProtector.protect(apiKey);
    }

    private void saveConfiguration(
            ModelConfiguration existing,
            String providerName,
            String baseUrl,
            String modelName,
            int contextWindow,
            String apiKeyCiphertext,
            Instant now
    ) {
        if (existing == null) {
            configurationMapper.insert(new ModelConfiguration(
                    ModelConfigurationConstants.DEFAULT_CONFIGURATION_ID,
                    providerName,
                    baseUrl,
                    modelName,
                    contextWindow,
                    apiKeyCiphertext,
                    now,
                    now
            ));
            return;
        }
        existing.setProviderName(providerName);
        existing.setBaseUrl(baseUrl);
        existing.setModelName(modelName);
        existing.setContextWindow(contextWindow);
        existing.setApiKeyCiphertext(apiKeyCiphertext);
        existing.setUpdatedAt(now);
        configurationMapper.updateById(existing);
    }

    @Override
    public ChatCompletion completeChat(
            List<ChatMessage> messages,
            String correlationId
    ) {
        if (messages == null || messages.isEmpty()) {
            throw new IllegalArgumentException("对话消息不能为空");
        }
        return agentRuntimeClient.completeChat(
                List.copyOf(messages),
                requireConnection(),
                correlationId
        );
    }

    @Override
    public void streamChat(
            List<ChatMessage> messages,
            String correlationId,
            String model,
            String reasoningEffort,
            String memorySummary,
            String workspacePath,
            Consumer<ChatStreamEvent> eventConsumer
    ) {
        if (messages == null || messages.isEmpty()) {
            throw new IllegalArgumentException("对话消息不能为空");
        }
        agentRuntimeClient.streamChat(
                List.copyOf(messages),
                requireConnection(model),
                correlationId,
                reasoningEffort,
                memorySummary,
                workspacePath,
                eventConsumer
        );
    }

    private ModelConnection requireConnection() {
        return requireConnection(null);
    }

    private ModelConnection requireConnection(String modelOverride) {
        ModelConfiguration configuration = loadConfiguration();
        if (configuration == null || !hasEncryptedApiKey(configuration)) {
            throw new IllegalStateException("请先在设置中配置模型 API");
        }
        // 明文不进入 DTO、数据库或日志，只用于当前一次进程内调用。
        return new ModelConnection(
                configuration.getProviderName(),
                configuration.getBaseUrl(),
                modelOverride == null || modelOverride.isBlank()
                        ? configuration.getModelName()
                        : modelOverride.trim(),
                secretProtector.unprotect(
                        configuration.getApiKeyCiphertext()
                )
        );
    }

    private ModelConfiguration loadConfiguration() {
        return configurationMapper.selectById(
                ModelConfigurationConstants.DEFAULT_CONFIGURATION_ID
        );
    }

    private ModelSettings toPublicSettings(
            ModelConfiguration configuration
    ) {
        return new ModelSettings(
                configuration.getProviderName(),
                configuration.getBaseUrl(),
                configuration.getModelName(),
                configuration.getContextWindow(),
                hasEncryptedApiKey(configuration)
        );
    }

    private boolean hasEncryptedApiKey(ModelConfiguration configuration) {
        return configuration != null
                && configuration.getApiKeyCiphertext() != null
                && !configuration.getApiKeyCiphertext().isBlank();
    }

    private String validateBaseUrl(String value) {
        String normalized = requireText(value, "API 地址");
        if (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        URI uri;
        try {
            uri = URI.create(normalized);
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException(
                    "模型 API 地址格式无效",
                    error
            );
        }
        boolean loopbackHttp = "http".equalsIgnoreCase(uri.getScheme())
                && ("127.0.0.1".equalsIgnoreCase(uri.getHost())
                || "localhost".equalsIgnoreCase(uri.getHost()));
        if (!"https".equalsIgnoreCase(uri.getScheme()) && !loopbackHttp) {
            throw new IllegalArgumentException("远程模型 API 必须使用 HTTPS");
        }
        if (uri.getHost() == null
                || uri.getUserInfo() != null
                || uri.getQuery() != null
                || uri.getFragment() != null) {
            throw new IllegalArgumentException("模型 API 地址格式无效");
        }
        return normalized;
    }

    private String requireText(String value, String label) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(label + "不能为空");
        }
        return value.trim();
    }
}
