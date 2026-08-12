package com.lumora.core.model.api.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;

public class SaveProviderModelRequest {
    @NotBlank @Size(max = 160)
    private String modelId;
    @Min(1) @Max(10_000_000)
    private int contextWindow;
    @Min(1) @Max(10_000_000)
    private int maxOutputTokens;
    @Size(max = 16)
    private List<@NotBlank @Size(max = 64) String> reasoningEfforts = List.of();
    private boolean webSearchEnabled;
    public String getModelId() { return modelId; }
    public void setModelId(String modelId) { this.modelId = modelId; }
    public int getContextWindow() { return contextWindow; }
    public void setContextWindow(int contextWindow) { this.contextWindow = contextWindow; }
    public int getMaxOutputTokens() { return maxOutputTokens; }
    public void setMaxOutputTokens(int maxOutputTokens) { this.maxOutputTokens = maxOutputTokens; }
    public List<String> getReasoningEfforts() { return reasoningEfforts; }
    public void setReasoningEfforts(List<String> reasoningEfforts) {
        this.reasoningEfforts = reasoningEfforts == null ? List.of() : reasoningEfforts;
    }
    public boolean isWebSearchEnabled() { return webSearchEnabled; }
    public void setWebSearchEnabled(boolean webSearchEnabled) {
        this.webSearchEnabled = webSearchEnabled;
    }
}
