package com.lumora.core.agent.dto.request;

public class AgentModelListRequest {

    private final String providerName;
    private final String baseUrl;
    private final String apiKey;
    private final String apiFormat;

    public AgentModelListRequest(
            String providerName,
            String baseUrl,
            String apiKey
    ) {
        this(providerName, baseUrl, apiKey, "chat-completions");
    }

    public AgentModelListRequest(
            String providerName,
            String baseUrl,
            String apiKey,
            String apiFormat
    ) {
        this.providerName = providerName;
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
        this.apiFormat = apiFormat == null || apiFormat.isBlank()
                ? "chat-completions" : apiFormat.trim();
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

    public String getApiFormat() {
        return apiFormat;
    }
}
