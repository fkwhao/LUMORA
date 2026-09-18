package com.lumora.core.agent.dto.response;

public class AgentMcpOAuthResponse {
    private String flowId;
    private String status;
    private String authorizationUrl;
    private AgentMcpTestResponse result;
    private String error;

    public String getFlowId() { return flowId; }
    public void setFlowId(String flowId) { this.flowId = flowId; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getAuthorizationUrl() { return authorizationUrl; }
    public void setAuthorizationUrl(String authorizationUrl) {
        this.authorizationUrl = authorizationUrl;
    }
    public AgentMcpTestResponse getResult() { return result; }
    public void setResult(AgentMcpTestResponse result) { this.result = result; }
    public String getError() { return error; }
    public void setError(String error) { this.error = error; }
}
