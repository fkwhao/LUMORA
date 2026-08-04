package com.lumora.core.dto.response;

import com.lumora.core.model.ProviderModel;

public class ProviderModelResponse {
    private final String modelConfigurationId;
    private final String modelId;
    private final int contextWindow;
    private final int maxOutputTokens;

    private ProviderModelResponse(ProviderModel model) {
        modelConfigurationId = model.getModelConfigurationId();
        modelId = model.getModelId();
        contextWindow = model.getContextWindow();
        maxOutputTokens = model.getMaxOutputTokens();
    }
    public static ProviderModelResponse fromModel(ProviderModel model) {
        return new ProviderModelResponse(model);
    }
    public String getModelConfigurationId() { return modelConfigurationId; }
    public String getModelId() { return modelId; }
    public int getContextWindow() { return contextWindow; }
    public int getMaxOutputTokens() { return maxOutputTokens; }
}
