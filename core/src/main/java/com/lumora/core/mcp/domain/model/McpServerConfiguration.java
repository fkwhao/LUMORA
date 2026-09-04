package com.lumora.core.mcp.domain.model;

import java.util.List;

public record McpServerConfiguration(
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
        boolean credentialConfigured,
        List<String> environmentKeys,
        boolean environmentConfigured
) { }
