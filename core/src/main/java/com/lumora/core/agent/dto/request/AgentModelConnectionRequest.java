package com.lumora.core.agent.dto.request;

import com.lumora.core.model.ModelConnection;

public class AgentModelConnectionRequest {

    private final String providerName;
    private final String baseUrl;
    private final String model;
    private final String apiKey;

    public AgentModelConnectionRequest(ModelConnection connection) {
        this.providerName = connection.getProviderName();
        this.baseUrl = connection.getBaseUrl();
        this.model = connection.getModel();
        this.apiKey = connection.getApiKey();
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
}
