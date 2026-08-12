package com.lumora.core.mcp.domain.model;

public final class McpServerRuntimeConfiguration {
    private final String serverId;
    private final String name;
    private final boolean enabled;
    private final String url;
    private final McpAuthenticationType authType;
    private final String headerName;
    private final String credential;

    public McpServerRuntimeConfiguration(
            String serverId,
            String name,
            boolean enabled,
            String url,
            McpAuthenticationType authType,
            String headerName,
            String credential
    ) {
        this.serverId = serverId;
        this.name = name;
        this.enabled = enabled;
        this.url = url;
        this.authType = authType;
        this.headerName = headerName;
        this.credential = credential;
    }

    public String serverId() { return serverId; }
    public String name() { return name; }
    public boolean enabled() { return enabled; }
    public String url() { return url; }
    public McpAuthenticationType authType() { return authType; }
    public String headerName() { return headerName; }
    public String credential() { return credential; }

    @Override
    public String toString() {
        return "McpServerRuntimeConfiguration[serverId=" + serverId
                + ", name=" + name + ", enabled=" + enabled
                + ", url=" + url + ", authType=" + authType
                + ", headerName=" + headerName + ", credential=<redacted>]";
    }
}
