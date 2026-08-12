package com.lumora.core.mcp.domain.model;

public record McpServerConfiguration(
        String serverId,
        String name,
        boolean enabled,
        String url,
        McpAuthenticationType authType,
        String headerName,
        boolean credentialConfigured
) { }
