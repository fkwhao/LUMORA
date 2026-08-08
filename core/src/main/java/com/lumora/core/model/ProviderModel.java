package com.lumora.core.model;

import java.util.List;

public class ProviderModel {
    private final String modelConfigurationId;
    private final String modelId;
    private final int contextWindow;
    private final int maxOutputTokens;
    private final List<String> reasoningEfforts;

    public ProviderModel(String modelConfigurationId, String modelId,
            int contextWindow, int maxOutputTokens,
            List<String> reasoningEfforts) {
        this.modelConfigurationId = modelConfigurationId;
        this.modelId = modelId;
        this.contextWindow = contextWindow;
        this.maxOutputTokens = maxOutputTokens;
        this.reasoningEfforts = List.copyOf(reasoningEfforts);
    }
    public String getModelConfigurationId() { return modelConfigurationId; }
    public String getModelId() { return modelId; }
    public int getContextWindow() { return contextWindow; }
    public int getMaxOutputTokens() { return maxOutputTokens; }
    public List<String> getReasoningEfforts() { return reasoningEfforts; }
}
