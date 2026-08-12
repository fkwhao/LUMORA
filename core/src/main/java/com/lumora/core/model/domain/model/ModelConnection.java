package com.lumora.core.model.domain.model;

/**
 * 只在 Java 到 Python 的单次模型调用期间存在的完整连接信息。
 */
public class ModelConnection {

    private final String providerName;
    private final String baseUrl;
    private final String model;
    private final String apiKey;
    private final Integer maxOutputTokens;
    private final Integer contextWindow;
    private final String apiFormat;
    private final boolean webSearchEnabled;

    public ModelConnection(
            String providerName,
            String baseUrl,
            String model,
            String apiKey
    ) {
        this(providerName, baseUrl, model, apiKey, null, null,
                "chat-completions", false);
    }

    public ModelConnection(
            String providerName,
            String baseUrl,
            String model,
            String apiKey,
            Integer maxOutputTokens
    ) {
        this(providerName, baseUrl, model, apiKey, maxOutputTokens, null,
                "chat-completions", false);
    }

    public ModelConnection(String providerName, String baseUrl, String model,
            String apiKey, Integer maxOutputTokens, Integer contextWindow) {
        this(providerName, baseUrl, model, apiKey, maxOutputTokens,
                contextWindow, "chat-completions", false);
    }

    public ModelConnection(String providerName, String baseUrl, String model,
            String apiKey, Integer maxOutputTokens, Integer contextWindow,
            String apiFormat) {
        this(providerName, baseUrl, model, apiKey, maxOutputTokens,
                contextWindow, apiFormat, false);
    }

    public ModelConnection(String providerName, String baseUrl, String model,
            String apiKey, Integer maxOutputTokens, Integer contextWindow,
            String apiFormat, boolean webSearchEnabled) {
        this.providerName = providerName;
        this.baseUrl = baseUrl;
        this.model = model;
        this.apiKey = apiKey;
        this.maxOutputTokens = maxOutputTokens;
        this.contextWindow = contextWindow;
        this.apiFormat = apiFormat == null || apiFormat.isBlank()
                ? "chat-completions" : apiFormat.trim();
        this.webSearchEnabled = webSearchEnabled;
    }

    public String getProviderName() {
        return providerName;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public String getModel() {
        return model;
    }

    public String getApiKey() {
        return apiKey;
    }

    public Integer getMaxOutputTokens() {
        return maxOutputTokens;
    }

    public Integer getContextWindow() { return contextWindow; }

    public String getApiFormat() { return apiFormat; }

    public boolean isWebSearchEnabled() { return webSearchEnabled; }
}
