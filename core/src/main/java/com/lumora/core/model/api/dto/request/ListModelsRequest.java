package com.lumora.core.model.api.dto.request;

import com.lumora.core.model.domain.model.ModelConfigurationConstants;

import com.lumora.core.model.domain.model.ModelConfigurationConstants;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class ListModelsRequest {

    @NotBlank(message = "模型供应商不能为空")
    @Size(max = 80, message = "模型供应商名称过长")
    private String providerName;
    @NotBlank(message = "API 地址不能为空")
    @Size(max = 500, message = "API 地址过长")
    private String baseUrl;
    @Size(
            max = ModelConfigurationConstants.MAX_API_KEY_LENGTH,
            message = "API Key 过长"
    )
    private String apiKey;

    public String getProviderName() {
        return providerName;
    }

    public void setProviderName(String providerName) {
        this.providerName = providerName;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    public String getApiKey() {
        return apiKey;
    }

    public void setApiKey(String apiKey) {
        this.apiKey = apiKey;
    }
}
