package com.lumora.core.agent.dto.response;

import java.util.List;

public class AgentMemoryExtractionResponse {

    private List<AgentMemoryCandidateResponse> candidates;

    public AgentMemoryExtractionResponse() {
    }

    public List<AgentMemoryCandidateResponse> getCandidates() {
        return candidates;
    }

    public void setCandidates(List<AgentMemoryCandidateResponse> candidates) {
        this.candidates = candidates;
    }
}
