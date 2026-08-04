package com.lumora.core.model;

/**
 * 只在 Java 到 Python 的单次模型调用期间存在的完整连接信息。
 */
public class ModelConnection {

    private final String providerName;
    private final String baseUrl;
    private final String model;
    private final String apiKey;
    private final Integer maxOutputTokens;

    public ModelConnection(
            String providerName,
            String baseUrl,
            String model,
            String apiKey
    ) {
        this(providerName, baseUrl, model, apiKey, null);
    }

    public ModelConnection(
            String providerName,
            String baseUrl,
            String model,
            String apiKey,
            Integer maxOutputTokens
    ) {
        this.providerName = providerName;
        this.baseUrl = baseUrl;
        this.model = model;
        this.apiKey = apiKey;
        this.maxOutputTokens = maxOutputTokens;
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
}
