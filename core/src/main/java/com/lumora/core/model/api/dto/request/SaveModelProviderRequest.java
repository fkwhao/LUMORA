package com.lumora.core.model.api.dto.request;

import com.lumora.core.model.domain.model.ModelConfigurationConstants;

import com.lumora.core.model.domain.model.ModelConfigurationConstants;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public class SaveModelProviderRequest {
    @NotBlank @Size(max = 80)
    private String providerName;
    @NotBlank @Size(max = 500)
    private String baseUrl;
    @NotBlank @Size(max = 160)
    private String model;
    @Min(1) @Max(10_000_000)
    private int contextWindow;
    @NotBlank
    @Pattern(regexp = "anthropic|chat-completions|responses")
    private String apiFormat;
    @Size(max = ModelConfigurationConstants.MAX_API_KEY_LENGTH)
    private String apiKey;

    public String getProviderName() { return providerName; }
    public void setProviderName(String providerName) { this.providerName = providerName; }
    public String getBaseUrl() { return baseUrl; }
    public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }
    public String getModel() { return model; }
    public void setModel(String model) { this.model = model; }
    public int getContextWindow() { return contextWindow; }
    public void setContextWindow(int contextWindow) { this.contextWindow = contextWindow; }
    public String getApiFormat() { return apiFormat; }
    public void setApiFormat(String apiFormat) { this.apiFormat = apiFormat; }
    public String getApiKey() { return apiKey; }
    public void setApiKey(String apiKey) { this.apiKey = apiKey; }
}
