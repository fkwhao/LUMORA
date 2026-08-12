package com.lumora.core.mcp.domain.model;

import java.util.List;

public record McpConnectionTest(
        boolean connected,
        String serverName,
        String serverVersion,
        List<String> tools,
        List<String> resources,
        List<String> resourceTemplates,
        List<String> prompts,
        String echoOutput
) {
    public McpConnectionTest {
        tools = tools == null ? List.of() : List.copyOf(tools);
        resources = resources == null ? List.of() : List.copyOf(resources);
        resourceTemplates = resourceTemplates == null
                ? List.of() : List.copyOf(resourceTemplates);
        prompts = prompts == null ? List.of() : List.copyOf(prompts);
    }
}
