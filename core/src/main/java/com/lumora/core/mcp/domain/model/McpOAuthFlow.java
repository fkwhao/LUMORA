package com.lumora.core.mcp.domain.model;

/**
 * OAuth flow state exposed to the desktop process. It never contains an
 * access token; the token remains in the Agent OAuth storage.
 */
public record McpOAuthFlow(
        String flowId,
        String status,
        String authorizationUrl,
        McpConnectionTest result,
        String error
) { }
