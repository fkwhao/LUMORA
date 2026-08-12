package com.lumora.core.mcp.application.service.impl;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lumora.core.agent.client.AgentRuntimeClient;
import com.lumora.core.mcp.api.dto.request.SaveMcpServerRequest;
import com.lumora.core.mcp.application.service.McpService;
import com.lumora.core.mcp.domain.model.McpAuthenticationType;
import com.lumora.core.mcp.domain.model.McpConnectionTest;
import com.lumora.core.mcp.domain.model.McpServerConfiguration;
import com.lumora.core.mcp.domain.model.McpServerRuntimeConfiguration;
import com.lumora.core.shared.security.secret.SecretProtector;
import com.lumora.core.shared.settings.domain.ApplicationSetting;
import com.lumora.core.shared.settings.infrastructure.ApplicationSettingMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class McpServiceImpl implements McpService {
    private static final String SETTINGS_KEY = "mcp.servers";
    private static final String DEFAULT_API_KEY_HEADER = "X-API-Key";
    private static final Set<String> RESERVED_HEADERS = Set.of(
            "accept", "authorization", "connection", "content-length",
            "content-type", "cookie", "host", "mcp-protocol-version",
            "mcp-session-id", "proxy-authorization", "set-cookie",
            "transfer-encoding"
    );
    private static final TypeReference<List<StoredMcpServerConfiguration>> LIST_TYPE =
            new TypeReference<>() { };

    private final ApplicationSettingMapper settingMapper;
    private final ObjectMapper objectMapper;
    private final AgentRuntimeClient agentRuntimeClient;
    private final Clock clock;
    private final SecretProtector secretProtector;

    @Override
    public List<McpServerConfiguration> listServers() {
        return listStoredServers().stream().map(this::toPublic).toList();
    }

    @Override
    public List<McpServerRuntimeConfiguration> listEnabledServers() {
        return listStoredServers().stream()
                .filter(StoredMcpServerConfiguration::enabled)
                .map(this::toRuntime)
                .toList();
    }

    @Override
    @Transactional
    public McpServerConfiguration save(
            String serverId,
            SaveMcpServerRequest request
    ) {
        String id = requireId(serverId);
        List<StoredMcpServerConfiguration> servers =
                new ArrayList<>(listStoredServers());
        StoredMcpServerConfiguration existing = servers.stream()
                .filter(server -> server.serverId().equals(id))
                .findFirst()
                .orElse(null);
        StoredMcpServerConfiguration normalized = normalize(id, request, existing);
        servers.removeIf(server -> server.serverId().equals(id));
        servers.add(normalized);
        persist(servers);
        return toPublic(normalized);
    }

    @Override
    @Transactional
    public boolean delete(String serverId) {
        String id = requireId(serverId);
        List<StoredMcpServerConfiguration> servers =
                new ArrayList<>(listStoredServers());
        boolean removed = servers.removeIf(server -> server.serverId().equals(id));
        if (removed) persist(servers);
        return removed;
    }

    @Override
    public McpConnectionTest test(String serverId, String correlationId) {
        String id = requireId(serverId);
        McpServerRuntimeConfiguration server = listStoredServers().stream()
                .filter(item -> item.serverId().equals(id))
                .findFirst()
                .map(this::toRuntime)
                .orElseThrow(() -> new IllegalArgumentException("MCP Server 不存在"));
        return agentRuntimeClient.testMcpServer(server, correlationId);
    }

    private List<StoredMcpServerConfiguration> listStoredServers() {
        ApplicationSetting setting = settingMapper.selectById(SETTINGS_KEY);
        if (setting == null || setting.getSettingValue() == null
                || setting.getSettingValue().isBlank()) {
            return List.of();
        }
        try {
            return List.copyOf(objectMapper.readValue(
                    setting.getSettingValue(), LIST_TYPE
            ));
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("MCP 配置无法读取", error);
        }
    }

    private StoredMcpServerConfiguration normalize(
            String serverId,
            SaveMcpServerRequest request,
            StoredMcpServerConfiguration existing
    ) {
        if (request == null) throw new IllegalArgumentException("MCP 配置不能为空");
        String name = requireText(request.getName(), "MCP Server 名称");
        String url = blankToNull(request.getUrl());
        if (url == null || !(url.startsWith("http://")
                || url.startsWith("https://"))) {
            throw new IllegalArgumentException("远程 MCP Server 必须配置 HTTP(S) 地址");
        }

        McpAuthenticationType authType = McpAuthenticationType.fromValue(
                request.getAuthType()
        );
        String headerName = normalizeHeaderName(authType, request.getHeaderName());
        String credentialCiphertext = resolveCredentialCiphertext(
                authType, request.getCredential(), existing
        );
        return new StoredMcpServerConfiguration(
                serverId,
                name,
                request.isEnabled(),
                url,
                authType,
                headerName,
                credentialCiphertext
        );
    }

    private String resolveCredentialCiphertext(
            McpAuthenticationType authType,
            String credential,
            StoredMcpServerConfiguration existing
    ) {
        if (authType == McpAuthenticationType.NONE) return null;
        String normalizedCredential = blankToNull(credential);
        if (normalizedCredential != null) {
            return secretProtector.protect(normalizedCredential);
        }
        if (existing != null
                && normalizedAuthType(existing.authType()) == authType
                && existing.credentialCiphertext() != null
                && !existing.credentialCiphertext().isBlank()) {
            return existing.credentialCiphertext();
        }
        throw new IllegalArgumentException("首次配置或切换认证类型时必须提供凭据");
    }

    private static String normalizeHeaderName(
            McpAuthenticationType authType,
            String requestedHeaderName
    ) {
        if (authType == McpAuthenticationType.NONE
                || authType == McpAuthenticationType.BEARER) {
            return null;
        }
        String headerName = blankToNull(requestedHeaderName);
        if (headerName == null && authType == McpAuthenticationType.API_KEY) {
            headerName = DEFAULT_API_KEY_HEADER;
        }
        if (headerName == null) {
            throw new IllegalArgumentException("自定义 Header 认证必须填写 Header 名称");
        }
        if (!headerName.matches("[!#$%&'*+.^_`|~0-9A-Za-z-]{1,100}")) {
            throw new IllegalArgumentException("认证 Header 名称格式无效");
        }
        if (RESERVED_HEADERS.contains(headerName.toLowerCase(Locale.ROOT))) {
            throw new IllegalArgumentException("该 Header 名称由 MCP 传输层保留");
        }
        return headerName;
    }

    private McpServerConfiguration toPublic(StoredMcpServerConfiguration stored) {
        McpAuthenticationType authType = normalizedAuthType(stored.authType());
        return new McpServerConfiguration(
                stored.serverId(),
                stored.name(),
                stored.enabled(),
                stored.url(),
                authType,
                stored.headerName(),
                authType != McpAuthenticationType.NONE
                        && stored.credentialCiphertext() != null
                        && !stored.credentialCiphertext().isBlank()
        );
    }

    private McpServerRuntimeConfiguration toRuntime(
            StoredMcpServerConfiguration stored
    ) {
        McpAuthenticationType authType = normalizedAuthType(stored.authType());
        String credential = authType == McpAuthenticationType.NONE
                ? null
                : secretProtector.unprotect(stored.credentialCiphertext());
        return new McpServerRuntimeConfiguration(
                stored.serverId(),
                stored.name(),
                stored.enabled(),
                stored.url(),
                authType,
                stored.headerName(),
                credential
        );
    }

    private void persist(List<StoredMcpServerConfiguration> servers) {
        String json;
        try {
            json = objectMapper.writeValueAsString(servers);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("MCP 配置无法保存", error);
        }
        Instant now = clock.instant();
        ApplicationSetting setting = settingMapper.selectById(SETTINGS_KEY);
        if (setting == null) {
            settingMapper.insert(new ApplicationSetting(
                    SETTINGS_KEY, json, now, now
            ));
        } else {
            setting.setSettingValue(json);
            setting.setUpdatedAt(now);
            settingMapper.updateById(setting);
        }
    }

    private static McpAuthenticationType normalizedAuthType(
            McpAuthenticationType authType
    ) {
        return authType == null ? McpAuthenticationType.NONE : authType;
    }

    private static String requireId(String value) {
        String id = requireText(value, "MCP Server ID");
        if (!id.matches("[A-Za-z0-9._-]{1,80}")) {
            throw new IllegalArgumentException("MCP Server ID 无效");
        }
        return id;
    }

    private static String requireText(String value, String label) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(label + "不能为空");
        }
        return value.trim();
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private record StoredMcpServerConfiguration(
            String serverId,
            String name,
            boolean enabled,
            String url,
            McpAuthenticationType authType,
            String headerName,
            String credentialCiphertext
    ) { }
}
