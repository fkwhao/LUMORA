package com.lumora.core.agent.dto.request;

import com.lumora.core.model.ModelConnection;

public class AgentModelConnectionRequest {

    private final String providerName;
    private final String baseUrl;
    private final String model;
    private final String apiKey;
    private final Integer maxOutputTokens;

    public AgentModelConnectionRequest(ModelConnection connection) {
        this.providerName = connection.getProviderName();
        this.baseUrl = connection.getBaseUrl();
        this.model = connection.getModel();
        this.apiKey = connection.getApiKey();
        this.maxOutputTokens = connection.getMaxOutputTokens();
    }

    public String getProviderName() {
        return providerName;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public String getModel() {
        return model;
    }

    public String getApiKey() {
        return apiKey;
    }

    public Integer getMaxOutputTokens() {
        return maxOutputTokens;
    }
}
