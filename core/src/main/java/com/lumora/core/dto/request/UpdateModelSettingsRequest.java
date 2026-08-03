package com.lumora.core.dto.request;

import com.lumora.core.common.constant.ModelConfigurationConstants;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

public class UpdateModelSettingsRequest {

    @NotBlank(message = "模型供应商不能为空")
    @Size(max = 80, message = "模型供应商名称过长")
    private String providerName;
    @NotBlank(message = "API 地址不能为空")
    @Size(max = 500, message = "API 地址过长")
    private String baseUrl;
    @NotBlank(message = "模型名称不能为空")
    @Size(max = 160, message = "模型名称过长")
    private String model;
    @Min(value = 1, message = "上下文长度必须大于 0")
    @Max(value = 10_000_000, message = "上下文长度过大")
    private int contextWindow;
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

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public int getContextWindow() {
        return contextWindow;
    }

    public void setContextWindow(int contextWindow) {
        this.contextWindow = contextWindow;
    }

    public String getApiKey() {
        return apiKey;
    }

    public void setApiKey(String apiKey) {
        this.apiKey = apiKey;
    }
}
