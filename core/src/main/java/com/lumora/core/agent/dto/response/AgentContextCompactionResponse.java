package com.lumora.core.agent.dto.response;

public class AgentContextCompactionResponse {
    private String summary;
    private int beforeTokens;
    private int afterTokens;
    private Integer throughSequence;
    private Integer retainedFromSequence;
    private AgentTokenUsageResponse usage;

    public String getSummary() { return summary; }
    public int getBeforeTokens() { return beforeTokens; }
    public int getAfterTokens() { return afterTokens; }
    public Integer getThroughSequence() { return throughSequence; }
    public Integer getRetainedFromSequence() { return retainedFromSequence; }
    public AgentTokenUsageResponse getUsage() { return usage; }
}
