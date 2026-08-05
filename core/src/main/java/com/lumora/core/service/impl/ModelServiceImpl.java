package com.lumora.core.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.lumora.core.agent.client.AgentRuntimeClient;
import com.lumora.core.agent.model.AgentMemoryCandidate;
import com.lumora.core.common.constant.ModelConfigurationConstants;
import com.lumora.core.entity.ModelConfiguration;
import com.lumora.core.entity.ModelConfigurationModel;
import com.lumora.core.mapper.ModelConfigurationMapper;
import com.lumora.core.mapper.ModelConfigurationModelMapper;
import com.lumora.core.model.ChatCompletion;
import com.lumora.core.model.ChatMessage;
import com.lumora.core.model.ChatStreamEvent;
import com.lumora.core.model.ContextCompaction;
import com.lumora.core.model.ModelConnection;
import com.lumora.core.model.ModelSettings;
import com.lumora.core.model.ModelProvider;
import com.lumora.core.model.ProviderModel;
import com.lumora.core.security.secret.SecretProtector;
import com.lumora.core.service.ModelService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.function.Consumer;

/**
 * 模型配置与模型调用的业务入口。
 *
 * <p>API Key 只以受保护密文落库；调用 Agent 时才在当前进程内短暂解密。</p>
 */
@Service
@RequiredArgsConstructor
public class ModelServiceImpl implements ModelService {

    private static final String DEFAULT_API_FORMAT = "chat-completions";
    private static final int DEFAULT_MAX_OUTPUT_TOKENS = 8192;

    private final ModelConfigurationMapper configurationMapper;
    private final ModelConfigurationModelMapper configurationModelMapper;
    private final SecretProtector secretProtector;
    private final AgentRuntimeClient agentRuntimeClient;
    private final Clock clock;

    @Override
    public List<ModelProvider> listProviders(String correlationId) {
        requireText(correlationId, "关联 ID");
        return configurationMapper.selectList(
                        new QueryWrapper<ModelConfiguration>()
                                .orderByDesc("is_active")
                                .orderByAsc("created_at")
                ).stream().map(this::toProvider).toList();
    }

    @Override
    @Transactional
    public ModelProvider createProvider(String providerName, String baseUrl,
            String model, int contextWindow, String apiFormat, String apiKey,
            String correlationId) {
        requireText(correlationId, "关联 ID");
        String normalizedKey = apiKey == null ? "" : apiKey.trim();
        if (normalizedKey.isEmpty()) {
            throw new IllegalArgumentException("首次配置必须提供 API Key");
        }
        String providerId = UUID.randomUUID().toString();
        boolean first = configurationMapper.selectCount(null) == 0;
        Instant now = clock.instant();
        ModelConfiguration configuration = new ModelConfiguration(
                providerId,
                requireText(providerName, "模型供应商"),
                validateBaseUrl(baseUrl),
                requireText(model, "模型名称"),
                validateContextWindow(contextWindow),
                resolveApiKeyCiphertext(null, normalizedKey),
                validateApiFormat(apiFormat),
                first,
                now,
                now
        );
        configurationMapper.insert(configuration);
        configurationModelMapper.insert(new ModelConfigurationModel(
                UUID.randomUUID().toString(), providerId,
                configuration.getModelName(), configuration.getContextWindow(),
                DEFAULT_MAX_OUTPUT_TOKENS, now, now));
        return toProvider(configuration);
    }

    @Override
    @Transactional
    public ModelProvider updateProvider(String providerId, String providerName,
            String baseUrl, String model, int contextWindow, String apiFormat,
            String apiKey, String correlationId) {
        requireText(correlationId, "关联 ID");
        ModelConfiguration configuration = requireProvider(providerId);
        configuration.setProviderName(requireText(providerName, "模型供应商"));
        configuration.setBaseUrl(validateBaseUrl(baseUrl));
        configuration.setModelName(requireText(model, "模型名称"));
        configuration.setContextWindow(validateContextWindow(contextWindow));
        configuration.setApiFormat(validateApiFormat(apiFormat));
        configuration.setApiKeyCiphertext(resolveApiKeyCiphertext(
                configuration, apiKey == null ? "" : apiKey.trim()));
        configuration.setUpdatedAt(clock.instant());
        configurationMapper.updateById(configuration);
        ensureModelExists(configuration);
        return toProvider(configuration);
    }

    @Override
    @Transactional
    public ModelProvider activateProvider(String providerId, String correlationId) {
        requireText(correlationId, "关联 ID");
        ModelConfiguration selected = requireProvider(providerId);
        if (loadProviderModels(providerId).isEmpty()) {
            throw new IllegalArgumentException("请先为供应商添加至少一个模型");
        }
        configurationMapper.selectList(null).forEach(configuration -> {
            boolean active = configuration.getConfigurationId().equals(providerId);
            if (configuration.isActive() != active) {
                configuration.setActive(active);
                configuration.setUpdatedAt(clock.instant());
                configurationMapper.updateById(configuration);
            }
        });
        selected.setActive(true);
        return toProvider(selected);
    }

    @Override
    @Transactional
    public ModelProvider disableProvider(String providerId, String correlationId) {
        requireText(correlationId, "关联 ID");
        ModelConfiguration selected = requireProvider(providerId);
        selected.setActive(false);
        selected.setUpdatedAt(clock.instant());
        configurationMapper.updateById(selected);
        return toProvider(selected);
    }

    @Override
    @Transactional
    public void deleteProvider(String providerId, String correlationId) {
        requireText(correlationId, "关联 ID");
        ModelConfiguration deleting = requireProvider(providerId);
        configurationMapper.deleteById(providerId);
        if (deleting.isActive()) {
            List<ModelConfiguration> remaining = configurationMapper.selectList(
                    new QueryWrapper<ModelConfiguration>().orderByAsc("created_at"));
            if (!remaining.isEmpty()) {
                ModelConfiguration next = remaining.get(0);
                next.setActive(true);
                next.setUpdatedAt(clock.instant());
                configurationMapper.updateById(next);
            }
        }
    }

    @Override
    @Transactional
    public List<String> listProviderModels(String providerId, String apiKey,
            String correlationId) {
        ModelConfiguration provider = requireProvider(providerId);
        String resolvedKey = apiKey == null ? "" : apiKey.trim();
        if (resolvedKey.isEmpty()) {
            if (!hasEncryptedApiKey(provider)) {
                throw new IllegalArgumentException("请先输入 API Key");
            }
            resolvedKey = secretProtector.unprotect(provider.getApiKeyCiphertext());
        }
        List<String> discovered = agentRuntimeClient.listModels(provider.getProviderName(),
                provider.getBaseUrl(), resolvedKey,
                requireText(correlationId, "关联 ID"));
        Instant now = clock.instant();
        for (String modelId : discovered) {
            if (findProviderModelByName(providerId, modelId) == null) {
                configurationModelMapper.insert(new ModelConfigurationModel(
                        UUID.randomUUID().toString(), providerId, modelId,
                        provider.getContextWindow(), DEFAULT_MAX_OUTPUT_TOKENS,
                        now, now));
            }
        }
        return discovered;
    }

    @Override
    @Transactional
    public ProviderModel createProviderModel(String providerId, String modelId,
            int contextWindow, int maxOutputTokens, String correlationId) {
        requireText(correlationId, "关联 ID");
        ModelConfiguration provider = requireProvider(providerId);
        String normalizedModel = requireText(modelId, "模型 ID");
        if (findProviderModelByName(providerId, normalizedModel) != null) {
            throw new IllegalArgumentException("模型 ID 已存在");
        }
        Instant now = clock.instant();
        ModelConfigurationModel model = new ModelConfigurationModel(
                UUID.randomUUID().toString(), providerId, normalizedModel,
                validateContextWindow(contextWindow),
                validateMaxOutputTokens(maxOutputTokens), now, now);
        configurationModelMapper.insert(model);
        if (provider.getModelName() == null || provider.getModelName().isBlank()) {
            updateDefaultModel(provider, model);
        }
        return toProviderModel(model);
    }

    @Override
    @Transactional
    public ProviderModel updateProviderModel(String providerId,
            String modelConfigurationId, String modelId, int contextWindow,
            int maxOutputTokens, String correlationId) {
        requireText(correlationId, "关联 ID");
        ModelConfiguration provider = requireProvider(providerId);
        ModelConfigurationModel model = requireProviderModel(
                providerId, modelConfigurationId);
        String oldModelId = model.getModelId();
        String normalizedModel = requireText(modelId, "模型 ID");
        ModelConfigurationModel duplicate = findProviderModelByName(
                providerId, normalizedModel);
        if (duplicate != null && !duplicate.getModelConfigurationModelId()
                .equals(modelConfigurationId)) {
            throw new IllegalArgumentException("模型 ID 已存在");
        }
        model.setModelId(normalizedModel);
        model.setContextWindow(validateContextWindow(contextWindow));
        model.setMaxOutputTokens(validateMaxOutputTokens(maxOutputTokens));
        model.setUpdatedAt(clock.instant());
        configurationModelMapper.updateById(model);
        if (oldModelId.equals(provider.getModelName())) {
            updateDefaultModel(provider, model);
        }
        return toProviderModel(model);
    }

    @Override
    @Transactional
    public void deleteProviderModel(String providerId, String modelConfigurationId,
            String correlationId) {
        requireText(correlationId, "关联 ID");
        ModelConfiguration provider = requireProvider(providerId);
        ModelConfigurationModel deleting = requireProviderModel(
                providerId, modelConfigurationId);
        configurationModelMapper.deleteById(modelConfigurationId);
        if (deleting.getModelId().equals(provider.getModelName())) {
            List<ModelConfigurationModel> remaining = loadProviderModels(providerId);
            if (remaining.isEmpty()) {
                provider.setModelName("");
                provider.setActive(false);
                provider.setUpdatedAt(clock.instant());
                configurationMapper.updateById(provider);
            } else {
                updateDefaultModel(provider, remaining.get(0));
            }
        }
    }

    @Override
    public boolean testProviderModel(String providerId, String modelConfigurationId,
            String correlationId) {
        ModelConfiguration provider = requireProvider(providerId);
        ModelConfigurationModel model = requireProviderModel(
                providerId, modelConfigurationId);
        if (!hasEncryptedApiKey(provider)) {
            throw new IllegalArgumentException("请先配置 API Key");
        }
        agentRuntimeClient.completeChat(
                List.of(new ChatMessage("user", "Reply with OK.")),
                new ModelConnection(provider.getProviderName(), provider.getBaseUrl(),
                        model.getModelId(), secretProtector.unprotect(
                        provider.getApiKeyCiphertext()),
                        model.getMaxOutputTokens()),
                requireText(correlationId, "关联 ID"));
        return true;
    }

    @Override
    public void decideToolApproval(
            String approvalId,
            String decision,
            String correlationId
    ) {
        agentRuntimeClient.decideToolApproval(
                requireText(approvalId, "审批 ID"),
                requireText(decision, "审批决定"),
                requireText(correlationId, "关联 ID")
        );
    }

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
        contextWindow = validateContextWindow(contextWindow);
        String normalizedApiKey = apiKey == null ? "" : apiKey.trim();

        // 2. 留空表示保留已有 Key；输入新 Key 时才执行 DPAPI 加密。
        ModelConfiguration existing = loadConfiguration();
        String apiKeyCiphertext = resolveApiKeyCiphertext(
                existing,
                normalizedApiKey
        );

        // 3. 单配置模式下执行新增或更新，并只向前端返回脱敏信息。
        Instant now = clock.instant();
        ModelConfiguration saved = saveConfiguration(
                existing,
                normalizedProvider,
                normalizedBaseUrl,
                normalizedModel,
                contextWindow,
                apiKeyCiphertext,
                now
        );
        return toPublicSettings(saved);
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

    private ModelConfiguration saveConfiguration(
            ModelConfiguration existing,
            String providerName,
            String baseUrl,
            String modelName,
            int contextWindow,
            String apiKeyCiphertext,
            Instant now
    ) {
        if (existing == null) {
            ModelConfiguration created = new ModelConfiguration(
                    ModelConfigurationConstants.DEFAULT_CONFIGURATION_ID,
                    providerName,
                    baseUrl,
                    modelName,
                    contextWindow,
                    apiKeyCiphertext,
                    now,
                    now
            );
            configurationMapper.insert(created);
            return created;
        }
        existing.setProviderName(providerName);
        existing.setBaseUrl(baseUrl);
        existing.setModelName(modelName);
        existing.setContextWindow(contextWindow);
        existing.setApiKeyCiphertext(apiKeyCiphertext);
        existing.setUpdatedAt(now);
        configurationMapper.updateById(existing);
        return existing;
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
    public ContextCompaction compactContext(
            List<ChatMessage> messages,
            String memorySummary,
            String taskId,
            String conversationSummary,
            String model,
            String correlationId
    ) {
        if (messages == null || messages.isEmpty()) {
            throw new IllegalArgumentException("没有可压缩的会话消息");
        }
        return agentRuntimeClient.compactChat(
                List.copyOf(messages),
                requireConnection(model),
                memorySummary,
                requireText(taskId, "任务 ID"),
                conversationSummary,
                requireText(correlationId, "关联 ID")
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
        streamChat(
                messages,
                correlationId,
                model,
                reasoningEffort,
                memorySummary,
                workspacePath,
                "request_approval",
                eventConsumer
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
            String permissionMode,
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
                permissionMode,
                eventConsumer
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
            String permissionMode,
            String taskId,
            String conversationSummary,
            Consumer<ChatStreamEvent> eventConsumer
    ) {
        if (messages == null || messages.isEmpty()) {
            throw new IllegalArgumentException("对话消息不能为空");
        }
        agentRuntimeClient.streamChat(
                List.copyOf(messages), requireConnection(model), correlationId,
                reasoningEffort, memorySummary, workspacePath, permissionMode,
                taskId, conversationSummary, eventConsumer
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
        String resolvedModel = modelOverride == null || modelOverride.isBlank()
                ? configuration.getModelName()
                : modelOverride.trim();
        ModelConfigurationModel modelConfiguration = findProviderModelByName(
                configuration.getConfigurationId(), resolvedModel);
        return new ModelConnection(
                configuration.getProviderName(),
                configuration.getBaseUrl(),
                resolvedModel,
                secretProtector.unprotect(
                        configuration.getApiKeyCiphertext()
                ),
                modelConfiguration == null
                        ? null : modelConfiguration.getMaxOutputTokens(),
                modelConfiguration == null
                        ? configuration.getContextWindow()
                        : modelConfiguration.getContextWindow()
        );
    }

    private ModelConfiguration loadConfiguration() {
        List<ModelConfiguration> active = configurationMapper.selectList(
                new QueryWrapper<ModelConfiguration>()
                        .eq("is_active", true)
                        .orderByDesc("updated_at")
                        .last("LIMIT 1")
        );
        if (!active.isEmpty()) {
            return active.get(0);
        }
        // 兼容升级前的单配置记录；V12 迁移后该行会被标记为 active。
        ModelConfiguration legacy = configurationMapper.selectById(
                ModelConfigurationConstants.DEFAULT_CONFIGURATION_ID
        );
        return legacy != null && legacy.isActive() ? legacy : null;
    }

    private ModelConfiguration requireProvider(String providerId) {
        ModelConfiguration provider = configurationMapper.selectById(
                requireText(providerId, "供应商 ID"));
        if (provider == null) {
            throw new IllegalArgumentException("模型供应商不存在");
        }
        return provider;
    }

    private ModelProvider toProvider(ModelConfiguration configuration) {
        return new ModelProvider(
                configuration.getConfigurationId(),
                configuration.getProviderName(),
                configuration.getBaseUrl(),
                configuration.getModelName(),
                configuration.getContextWindow(),
                configuration.getApiFormat() == null
                        ? DEFAULT_API_FORMAT : configuration.getApiFormat(),
                configuration.isActive(),
                hasEncryptedApiKey(configuration),
                loadProviderModels(configuration.getConfigurationId()).stream()
                        .map(this::toProviderModel)
                        .toList()
        );
    }

    private List<ModelConfigurationModel> loadProviderModels(String providerId) {
        return configurationModelMapper.selectList(
                new QueryWrapper<ModelConfigurationModel>()
                        .eq("configuration_id", providerId)
                        .orderByAsc("created_at"));
    }

    private ModelConfigurationModel findProviderModelByName(
            String providerId, String modelId) {
        List<ModelConfigurationModel> matches = configurationModelMapper.selectList(
                new QueryWrapper<ModelConfigurationModel>()
                        .eq("configuration_id", providerId)
                        .eq("model_id", requireText(modelId, "模型 ID"))
                        .last("LIMIT 1"));
        return matches.isEmpty() ? null : matches.get(0);
    }

    private ModelConfigurationModel requireProviderModel(
            String providerId, String modelConfigurationId) {
        ModelConfigurationModel model = configurationModelMapper.selectById(
                requireText(modelConfigurationId, "模型配置 ID"));
        if (model == null || !model.getConfigurationId().equals(providerId)) {
            throw new IllegalArgumentException("模型配置不存在");
        }
        return model;
    }

    private ProviderModel toProviderModel(ModelConfigurationModel model) {
        return new ProviderModel(model.getModelConfigurationModelId(),
                model.getModelId(), model.getContextWindow(),
                model.getMaxOutputTokens());
    }

    private void updateDefaultModel(ModelConfiguration provider,
            ModelConfigurationModel model) {
        provider.setModelName(model.getModelId());
        provider.setContextWindow(model.getContextWindow());
        provider.setUpdatedAt(clock.instant());
        configurationMapper.updateById(provider);
    }

    private void ensureModelExists(ModelConfiguration provider) {
        if (findProviderModelByName(provider.getConfigurationId(),
                provider.getModelName()) != null) {
            return;
        }
        Instant now = clock.instant();
        configurationModelMapper.insert(new ModelConfigurationModel(
                UUID.randomUUID().toString(), provider.getConfigurationId(),
                provider.getModelName(), provider.getContextWindow(),
                DEFAULT_MAX_OUTPUT_TOKENS, now, now));
    }

    private int validateContextWindow(int contextWindow) {
        if (contextWindow < 1 || contextWindow > 10_000_000) {
            throw new IllegalArgumentException("上下文长度必须在 1 到 10000000 之间");
        }
        return contextWindow;
    }

    private int validateMaxOutputTokens(int maxOutputTokens) {
        if (maxOutputTokens < 1 || maxOutputTokens > 10_000_000) {
            throw new IllegalArgumentException(
                    "最大输出 Token 必须在 1 到 10000000 之间");
        }
        return maxOutputTokens;
    }

    private String validateApiFormat(String apiFormat) {
        String normalized = requireText(apiFormat, "API 格式");
        if (!List.of("anthropic", "chat-completions", "responses")
                .contains(normalized)) {
            throw new IllegalArgumentException("API 格式无效");
        }
        return normalized;
    }

    private ModelSettings toPublicSettings(
            ModelConfiguration configuration
    ) {
        ModelConfigurationModel selectedModel = findProviderModelByName(
                configuration.getConfigurationId(),
                configuration.getModelName());
        return new ModelSettings(
                configuration.getProviderName(),
                configuration.getBaseUrl(),
                configuration.getModelName(),
                selectedModel == null
                        ? configuration.getContextWindow()
                        : selectedModel.getContextWindow(),
                hasEncryptedApiKey(configuration),
                loadProviderModels(configuration.getConfigurationId()).stream()
                        .map(this::toProviderModel)
                        .toList()
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
