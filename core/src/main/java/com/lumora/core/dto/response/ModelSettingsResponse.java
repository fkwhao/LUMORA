package com.lumora.core.dto.response;

import com.lumora.core.model.ModelSettings;

public class ModelSettingsResponse {

    private final String providerName;
    private final String baseUrl;
    private final String model;
    private final int contextWindow;
    private final boolean apiKeyConfigured;

    public ModelSettingsResponse(
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

    public static ModelSettingsResponse fromModel(ModelSettings settings) {
        return new ModelSettingsResponse(
                settings.getProviderName(),
                settings.getBaseUrl(),
                settings.getModel(),
                settings.getContextWindow(),
                settings.isApiKeyConfigured()
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
}
