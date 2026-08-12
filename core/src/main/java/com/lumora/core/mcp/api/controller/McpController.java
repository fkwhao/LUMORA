package com.lumora.core.mcp.api.controller;

import com.lumora.core.mcp.api.dto.request.SaveMcpServerRequest;
import com.lumora.core.mcp.application.service.McpService;
import com.lumora.core.mcp.domain.model.McpConnectionTest;
import com.lumora.core.mcp.domain.model.McpServerConfiguration;
import com.lumora.core.shared.api.constant.ApiPathConstants;
import com.lumora.core.shared.api.constant.HttpContractConstants;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping(ApiPathConstants.MCP)
public class McpController {
    private final McpService mcpService;

    @GetMapping("/servers")
    public List<McpServerConfiguration> listServers() {
        return mcpService.listServers();
    }

    @PutMapping("/servers/{serverId}")
    public McpServerConfiguration save(
            @PathVariable String serverId,
            @Valid @RequestBody SaveMcpServerRequest request
    ) {
        return mcpService.save(serverId, request);
    }

    @DeleteMapping("/servers/{serverId}")
    public void delete(@PathVariable String serverId) {
        if (!mcpService.delete(serverId)) {
            throw new IllegalArgumentException("MCP Server 不存在");
        }
    }

    @PostMapping("/servers/{serverId}/test")
    public McpConnectionTest test(
            @PathVariable String serverId,
            @RequestHeader(HttpContractConstants.CORRELATION_ID_HEADER)
            String correlationId
    ) {
        return mcpService.test(serverId, correlationId);
    }
}
