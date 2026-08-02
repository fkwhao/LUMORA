package com.lumora.core.model;

public class ModelSettings {

    private final String providerName;
    private final String baseUrl;
    private final String model;
    private final boolean apiKeyConfigured;

    public ModelSettings(
            String providerName,
            String baseUrl,
            String model,
            boolean apiKeyConfigured
    ) {
        this.providerName = providerName;
        this.baseUrl = baseUrl;
        this.model = model;
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

    public boolean isApiKeyConfigured() {
        return apiKeyConfigured;
    }
}
