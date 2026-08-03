package com.lumora.core.model;

public class ModelSettings {

    private final String providerName;
    private final String baseUrl;
    private final String model;
    private final int contextWindow;
    private final boolean apiKeyConfigured;

    public ModelSettings(
            String providerName,
            String baseUrl,
            String model,
            int contextWindow,
            boolean apiKeyConfigured
    ) {
        this.providerName = providerName;
        this.baseUrl = baseUrl;
        this.model = model;
        this.contextWindow = contextWindow;
        this.apiKeyConfigured = apiKeyConfigured;
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

    public int getContextWindow() {
        return contextWindow;
    }

    public boolean isApiKeyConfigured() {
        return apiKeyConfigured;
    }
}
