package com.lumora.core.agent.dto.request;

public class AgentModelListRequest {

    private final String providerName;
    private final String baseUrl;
    private final String apiKey;

    public AgentModelListRequest(
            String providerName,
            String baseUrl,
            String apiKey
    ) {
        this.providerName = providerName;
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
    }

    public String getProviderName() {
        return providerName;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public String getApiKey() {
        return apiKey;
    }
}
