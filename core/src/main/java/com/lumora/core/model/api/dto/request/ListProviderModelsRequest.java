package com.lumora.core.model.api.dto.request;

import com.lumora.core.model.domain.model.ModelConfigurationConstants;

import com.lumora.core.model.domain.model.ModelConfigurationConstants;
import jakarta.validation.constraints.Size;

public class ListProviderModelsRequest {
    @Size(max = ModelConfigurationConstants.MAX_API_KEY_LENGTH)
    private String apiKey;
    public String getApiKey() { return apiKey; }
    public void setApiKey(String apiKey) { this.apiKey = apiKey; }
}
