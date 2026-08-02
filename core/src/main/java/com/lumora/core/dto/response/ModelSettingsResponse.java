package com.lumora.core.dto.response;

import com.lumora.core.model.ModelSettings;

public class ModelSettingsResponse {

    private final String providerName;
    private final String baseUrl;
    private final String model;
    private final boolean apiKeyConfigured;

    public ModelSettingsResponse(
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

    public static ModelSettingsResponse fromModel(ModelSettings settings) {
        return new ModelSettingsResponse(
                settings.getProviderName(),
                settings.getBaseUrl(),
                settings.getModel(),
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

    public boolean isApiKeyConfigured() {
        return apiKeyConfigured;
    }
}
