package com.lumora.core.agent.dto.request;

import com.lumora.core.mcp.domain.model.McpServerRuntimeConfiguration;

import java.util.List;
import java.util.Map;

public class AgentMcpServerRequest {
    private final String serverId;
    private final String name;
    private final boolean enabled;
    private final String transportType;
    private final String url;
    private final String command;
    private final List<String> arguments;
    private final String workingDirectory;
    private final Map<String, String> environment;
    private final String authType;
    private final String headerName;
    private final String credential;

    public AgentMcpServerRequest(McpServerRuntimeConfiguration configuration) {
        this.serverId = configuration.serverId();
        this.name = configuration.name();
        this.enabled = configuration.enabled();
        this.transportType = configuration.transportType().value();
        this.url = configuration.url();
        this.command = configuration.command();
        this.arguments = configuration.arguments();
        this.workingDirectory = configuration.workingDirectory();
        this.environment = configuration.environment();
        this.authType = configuration.authType().value();
        this.headerName = configuration.headerName();
        this.credential = configuration.credential();
    }

    public String getServerId() { return serverId; }
    public String getName() { return name; }
    public boolean isEnabled() { return enabled; }
    public String getTransportType() { return transportType; }
    public String getUrl() { return url; }
    public String getCommand() { return command; }
    public List<String> getArguments() { return arguments; }
    public String getWorkingDirectory() { return workingDirectory; }
    public Map<String, String> getEnvironment() { return environment; }
    public String getAuthType() { return authType; }
    public String getHeaderName() { return headerName; }
    public String getCredential() { return credential; }
}
