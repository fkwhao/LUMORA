package com.lumora.core.model.api.dto.response;

import com.lumora.core.model.domain.model.ProviderModel;
import java.util.List;

public class ProviderModelResponse {
    private final String modelConfigurationId;
    private final String modelId;
    private final int contextWindow;
    private final int maxOutputTokens;
    private final List<String> reasoningEfforts;
    private final boolean webSearchEnabled;

    private ProviderModelResponse(ProviderModel model) {
        modelConfigurationId = model.getModelConfigurationId();
        modelId = model.getModelId();
        contextWindow = model.getContextWindow();
        maxOutputTokens = model.getMaxOutputTokens();
        reasoningEfforts = model.getReasoningEfforts();
        webSearchEnabled = model.isWebSearchEnabled();
    }
    public static ProviderModelResponse fromModel(ProviderModel model) {
        return new ProviderModelResponse(model);
    }
    public String getModelConfigurationId() { return modelConfigurationId; }
    public String getModelId() { return modelId; }
    public int getContextWindow() { return contextWindow; }
    public int getMaxOutputTokens() { return maxOutputTokens; }
    public List<String> getReasoningEfforts() { return reasoningEfforts; }
    public boolean isWebSearchEnabled() { return webSearchEnabled; }
}
