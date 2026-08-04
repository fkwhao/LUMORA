package com.lumora.core.dto.response;

import com.lumora.core.model.ModelProvider;

import java.util.List;

public class ModelProviderResponse {
    private final String providerId;
    private final String providerName;
    private final String baseUrl;
    private final String model;
    private final int contextWindow;
    private final String apiFormat;
    private final boolean active;
    private final boolean apiKeyConfigured;
    private final List<ProviderModelResponse> models;

    private ModelProviderResponse(ModelProvider provider) {
        providerId = provider.getProviderId();
        providerName = provider.getProviderName();
        baseUrl = provider.getBaseUrl();
        model = provider.getModel();
        contextWindow = provider.getContextWindow();
        apiFormat = provider.getApiFormat();
        active = provider.isActive();
        apiKeyConfigured = provider.isApiKeyConfigured();
        models = provider.getModels().stream()
                .map(ProviderModelResponse::fromModel)
                .toList();
    }

    public static ModelProviderResponse fromModel(ModelProvider provider) {
        return new ModelProviderResponse(provider);
    }
    public String getProviderId() { return providerId; }
    public String getProviderName() { return providerName; }
    public String getBaseUrl() { return baseUrl; }
    public String getModel() { return model; }
    public int getContextWindow() { return contextWindow; }
    public String getApiFormat() { return apiFormat; }
    public boolean isActive() { return active; }
    public boolean isApiKeyConfigured() { return apiKeyConfigured; }
    public List<ProviderModelResponse> getModels() { return models; }
}
