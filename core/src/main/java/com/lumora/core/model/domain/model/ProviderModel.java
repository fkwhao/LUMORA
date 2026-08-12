package com.lumora.core.model.domain.model;

import java.util.List;

public class ProviderModel {
    private final String modelConfigurationId;
    private final String modelId;
    private final int contextWindow;
    private final int maxOutputTokens;
    private final List<String> reasoningEfforts;
    private final boolean webSearchEnabled;

    public ProviderModel(String modelConfigurationId, String modelId,
            int contextWindow, int maxOutputTokens,
            List<String> reasoningEfforts) {
        this(modelConfigurationId, modelId, contextWindow, maxOutputTokens,
                reasoningEfforts, false);
    }

    public ProviderModel(String modelConfigurationId, String modelId,
            int contextWindow, int maxOutputTokens,
            List<String> reasoningEfforts, boolean webSearchEnabled) {
        this.modelConfigurationId = modelConfigurationId;
        this.modelId = modelId;
        this.contextWindow = contextWindow;
        this.maxOutputTokens = maxOutputTokens;
        this.reasoningEfforts = List.copyOf(reasoningEfforts);
        this.webSearchEnabled = webSearchEnabled;
    }
    public String getModelConfigurationId() { return modelConfigurationId; }
    public String getModelId() { return modelId; }
    public int getContextWindow() { return contextWindow; }
    public int getMaxOutputTokens() { return maxOutputTokens; }
    public List<String> getReasoningEfforts() { return reasoningEfforts; }
    public boolean isWebSearchEnabled() { return webSearchEnabled; }
}
