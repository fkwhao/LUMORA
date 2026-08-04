package com.lumora.core.model;

public class ProviderModel {
    private final String modelConfigurationId;
    private final String modelId;
    private final int contextWindow;
    private final int maxOutputTokens;

    public ProviderModel(String modelConfigurationId, String modelId,
            int contextWindow, int maxOutputTokens) {
        this.modelConfigurationId = modelConfigurationId;
        this.modelId = modelId;
        this.contextWindow = contextWindow;
        this.maxOutputTokens = maxOutputTokens;
    }
    public String getModelConfigurationId() { return modelConfigurationId; }
    public String getModelId() { return modelId; }
    public int getContextWindow() { return contextWindow; }
    public int getMaxOutputTokens() { return maxOutputTokens; }
}
