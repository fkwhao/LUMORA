package com.lumora.core.agent.dto.response;

import java.util.List;

public class AgentMemoryExtractionResponse {

    private List<AgentMemoryCandidateResponse> candidates;
    private String model;
    private AgentTokenUsageResponse usage;

    public AgentMemoryExtractionResponse() {
    }

    public List<AgentMemoryCandidateResponse> getCandidates() {
        return candidates;
    }

    public void setCandidates(List<AgentMemoryCandidateResponse> candidates) {
        this.candidates = candidates;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public AgentTokenUsageResponse getUsage() {
        return usage;
    }

    public void setUsage(AgentTokenUsageResponse usage) {
        this.usage = usage;
    }
}
