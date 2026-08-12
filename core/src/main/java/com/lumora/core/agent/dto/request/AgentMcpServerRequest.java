package com.lumora.core.agent.dto.request;

import com.lumora.core.mcp.domain.model.McpServerRuntimeConfiguration;

public class AgentMcpServerRequest {
    private final String serverId;
    private final String name;
    private final boolean enabled;
    private final String url;
    private final String authType;
    private final String headerName;
    private final String credential;

    public AgentMcpServerRequest(McpServerRuntimeConfiguration configuration) {
        this.serverId = configuration.serverId();
        this.name = configuration.name();
        this.enabled = configuration.enabled();
        this.url = configuration.url();
        this.authType = configuration.authType().value();
        this.headerName = configuration.headerName();
        this.credential = configuration.credential();
    }

    public String getServerId() { return serverId; }
    public String getName() { return name; }
    public boolean isEnabled() { return enabled; }
    public String getUrl() { return url; }
    public String getAuthType() { return authType; }
    public String getHeaderName() { return headerName; }
    public String getCredential() { return credential; }
}
