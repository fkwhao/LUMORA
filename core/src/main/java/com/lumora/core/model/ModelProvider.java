package com.lumora.core.model;

import java.util.List;

public class ModelProvider {
    private final String providerId;
    private final String providerName;
    private final String baseUrl;
    private final String model;
    private final int contextWindow;
    private final String apiFormat;
    private final boolean active;
    private final boolean apiKeyConfigured;
    private final List<ProviderModel> models;

    public ModelProvider(String providerId, String providerName, String baseUrl,
                         String model, int contextWindow, String apiFormat,
                         boolean active, boolean apiKeyConfigured) {
        this(providerId, providerName, baseUrl, model, contextWindow,
                apiFormat, active, apiKeyConfigured, List.of());
    }

    public ModelProvider(String providerId, String providerName, String baseUrl,
                         String model, int contextWindow, String apiFormat,
                         boolean active, boolean apiKeyConfigured,
                         List<ProviderModel> models) {
        this.providerId = providerId;
        this.providerName = providerName;
        this.baseUrl = baseUrl;
        this.model = model;
        this.contextWindow = contextWindow;
        this.apiFormat = apiFormat;
        this.active = active;
        this.apiKeyConfigured = apiKeyConfigured;
        this.models = List.copyOf(models);
    }

    public String getProviderId() { return providerId; }
    public String getProviderName() { return providerName; }
    public String getBaseUrl() { return baseUrl; }
    public String getModel() { return model; }
    public int getContextWindow() { return contextWindow; }
    public String getApiFormat() { return apiFormat; }
    public boolean isActive() { return active; }
    public boolean isApiKeyConfigured() { return apiKeyConfigured; }
    public List<ProviderModel> getModels() { return models; }
}
