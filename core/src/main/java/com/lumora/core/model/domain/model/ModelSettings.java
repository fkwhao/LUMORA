package com.lumora.core.model.domain.model;

import java.util.List;

public class ModelSettings {

    private final String providerName;
    private final String baseUrl;
    private final String model;
    private final int contextWindow;
    private final boolean apiKeyConfigured;
    private final List<ProviderModel> models;

    public ModelSettings(
            String providerName,
            String baseUrl,
            String model,
            int contextWindow,
            boolean apiKeyConfigured
    ) {
        this(providerName, baseUrl, model, contextWindow,
                apiKeyConfigured, List.of());
    }

    public ModelSettings(
            String providerName,
            String baseUrl,
            String model,
            int contextWindow,
            boolean apiKeyConfigured,
            List<ProviderModel> models
    ) {
        this.providerName = providerName;
        this.baseUrl = baseUrl;
        this.model = model;
        this.contextWindow = contextWindow;
        this.apiKeyConfigured = apiKeyConfigured;
        this.models = List.copyOf(models);
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

    public List<ProviderModel> getModels() {
        return models;
    }
}
