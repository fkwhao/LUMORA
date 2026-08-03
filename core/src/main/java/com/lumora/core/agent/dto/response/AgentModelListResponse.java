package com.lumora.core.agent.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

public class AgentModelListResponse {

    private final List<String> models;

    public AgentModelListResponse(
            @JsonProperty("models") List<String> models
    ) {
        this.models = models == null ? List.of() : List.copyOf(models);
    }

    public List<String> getModels() {
        return models;
    }
}
