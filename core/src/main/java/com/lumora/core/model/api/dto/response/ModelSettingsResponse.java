package com.lumora.core.model.api.dto.response;

import com.lumora.core.model.domain.model.ModelSettings;

import java.util.List;

public class ModelSettingsResponse {

    private final String providerName;
    private final String baseUrl;
    private final String model;
    private final int contextWindow;
    private final boolean apiKeyConfigured;
    private final List<ProviderModelResponse> models;

    public ModelSettingsResponse(
            String providerName,
            String baseUrl,
            String model,
            int contextWindow,
            boolean apiKeyConfigured
    ) {
        this(providerName, baseUrl, model, contextWindow,
                apiKeyConfigured, List.of());
    }

    public ModelSettingsResponse(
            String providerName,
            String baseUrl,
            String model,
            int contextWindow,
            boolean apiKeyConfigured,
            List<ProviderModelResponse> models
    ) {
        this.providerName = providerName;
        this.baseUrl = baseUrl;
        this.model = model;
        this.contextWindow = contextWindow;
        this.apiKeyConfigured = apiKeyConfigured;
        this.models = List.copyOf(models);
    }

    public static ModelSettingsResponse fromModel(ModelSettings settings) {
        return new ModelSettingsResponse(
                settings.getProviderName(),
                settings.getBaseUrl(),
                settings.getModel(),
                settings.getContextWindow(),
                settings.isApiKeyConfigured(),
                settings.getModels().stream()
                        .map(ProviderModelResponse::fromModel)
                        .toList()
        );
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

    public List<ProviderModelResponse> getModels() {
        return models;
    }
}
