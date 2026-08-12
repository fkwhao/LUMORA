package com.lumora.core.mcp.application.service;

import com.lumora.core.mcp.api.dto.request.SaveMcpServerRequest;
import com.lumora.core.mcp.domain.model.McpConnectionTest;
import com.lumora.core.mcp.domain.model.McpServerConfiguration;
import com.lumora.core.mcp.domain.model.McpServerRuntimeConfiguration;

import java.util.List;

public interface McpService {
    List<McpServerConfiguration> listServers();
    List<McpServerRuntimeConfiguration> listEnabledServers();
    McpServerConfiguration save(String serverId, SaveMcpServerRequest request);
    boolean delete(String serverId);
    McpConnectionTest test(String serverId, String correlationId);
}
