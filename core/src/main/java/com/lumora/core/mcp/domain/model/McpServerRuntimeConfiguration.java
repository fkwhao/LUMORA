package com.lumora.core.mcp.domain.model;

import java.util.List;
import java.util.Map;

public final class McpServerRuntimeConfiguration {
    private final String serverId;
    private final String name;
    private final boolean enabled;
    private final McpTransportType transportType;
    private final String url;
    private final String command;
    private final List<String> arguments;
    private final String workingDirectory;
    private final McpAuthenticationType authType;
    private final String headerName;
    private final String credential;
    private final Map<String, String> environment;

    public McpServerRuntimeConfiguration(
            String serverId,
            String name,
            boolean enabled,
            McpTransportType transportType,
            String url,
            String command,
            List<String> arguments,
            String workingDirectory,
            McpAuthenticationType authType,
            String headerName,
            String credential,
            Map<String, String> environment
    ) {
        this.serverId = serverId;
        this.name = name;
        this.enabled = enabled;
        this.transportType = transportType;
        this.url = url;
        this.command = command;
        this.arguments = arguments == null ? List.of() : List.copyOf(arguments);
        this.workingDirectory = workingDirectory;
        this.authType = authType;
        this.headerName = headerName;
        this.credential = credential;
        this.environment = environment == null ? Map.of() : Map.copyOf(environment);
    }

    public String serverId() { return serverId; }
    public String name() { return name; }
    public boolean enabled() { return enabled; }
    public McpTransportType transportType() { return transportType; }
    public String url() { return url; }
    public String command() { return command; }
    public List<String> arguments() { return arguments; }
    public String workingDirectory() { return workingDirectory; }
    public McpAuthenticationType authType() { return authType; }
    public String headerName() { return headerName; }
    public String credential() { return credential; }
    public Map<String, String> environment() { return environment; }

    @Override
    public String toString() {
        return "McpServerRuntimeConfiguration[serverId=" + serverId
                + ", name=" + name + ", enabled=" + enabled
                + ", transportType=" + transportType
                + ", url=" + url + ", command=" + command
                + ", arguments=<" + arguments.size() + " items>"
                + ", workingDirectory=" + workingDirectory
                + ", authType=" + authType
                + ", headerName=" + headerName
                + ", credential=<redacted>, environment=<redacted>]";
    }
}
