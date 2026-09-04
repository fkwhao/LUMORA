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
import com.lumora.core.mcp.domain.model.McpTransportType;
import com.lumora.core.shared.security.secret.SecretProtector;
import com.lumora.core.shared.settings.domain.ApplicationSetting;
import com.lumora.core.shared.settings.infrastructure.ApplicationSettingMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

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
    private static final TypeReference<Map<String, String>> ENVIRONMENT_TYPE =
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
        McpTransportType transportType = McpTransportType.fromValue(
                request.getTransportType()
        );
        if (transportType == McpTransportType.STDIO) {
            return normalizeStdio(serverId, name, request, existing);
        }
        String url = blankToNull(request.getUrl());
        if (url == null || !(url.startsWith("http://")
                || url.startsWith("https://"))) {
            throw new IllegalArgumentException("远程 MCP Server 必须配置 HTTP(S) 地址");
        }
        if (blankToNull(request.getCommand()) != null
                || (request.getArguments() != null
                && !request.getArguments().isEmpty())
                || blankToNull(request.getWorkingDirectory()) != null
                || request.getEnvironment() != null
                || request.isClearEnvironment()) {
            throw new IllegalArgumentException(
                    "Streamable HTTP 配置不能包含 stdio 启动参数"
            );
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
                McpTransportType.STREAMABLE_HTTP,
                url,
                null,
                List.of(),
                null,
                authType,
                headerName,
                credentialCiphertext,
                List.of(),
                null
        );
    }

    private StoredMcpServerConfiguration normalizeStdio(
            String serverId,
            String name,
            SaveMcpServerRequest request,
            StoredMcpServerConfiguration existing
    ) {
        if (blankToNull(request.getUrl()) != null
                || McpAuthenticationType.fromValue(request.getAuthType())
                != McpAuthenticationType.NONE
                || blankToNull(request.getHeaderName()) != null
                || blankToNull(request.getCredential()) != null) {
            throw new IllegalArgumentException(
                    "stdio MCP Server 不支持 HTTP 地址或静态 Header 认证"
            );
        }
        String command = requireText(request.getCommand(), "stdio 启动命令");
        requireProcessText(command, "stdio 启动命令", 1000);
        List<String> arguments = normalizeArguments(request.getArguments());
        String workingDirectory = normalizeWorkingDirectory(
                request.getWorkingDirectory()
        );
        EncryptedEnvironment environment = resolveEnvironment(
                request, existing
        );
        return new StoredMcpServerConfiguration(
                serverId,
                name,
                request.isEnabled(),
                McpTransportType.STDIO,
                null,
                command,
                arguments,
                workingDirectory,
                McpAuthenticationType.NONE,
                null,
                null,
                environment.keys(),
                environment.ciphertext()
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
                && normalizedTransportType(existing.transportType())
                == McpTransportType.STREAMABLE_HTTP
                && normalizedAuthType(existing.authType()) == authType
                && existing.credentialCiphertext() != null
                && !existing.credentialCiphertext().isBlank()) {
            return existing.credentialCiphertext();
        }
        throw new IllegalArgumentException("首次配置或切换认证类型时必须提供凭据");
    }

    private EncryptedEnvironment resolveEnvironment(
            SaveMcpServerRequest request,
            StoredMcpServerConfiguration existing
    ) {
        Map<String, String> requested = request.getEnvironment();
        if (request.isClearEnvironment()
                && requested != null && !requested.isEmpty()) {
            throw new IllegalArgumentException(
                    "不能同时设置并清除 stdio 环境变量"
            );
        }
        if (request.isClearEnvironment()) return EncryptedEnvironment.empty();
        if (requested != null) {
            Map<String, String> normalized = normalizeEnvironment(requested);
            if (normalized.isEmpty()) return EncryptedEnvironment.empty();
            try {
                String plaintext = objectMapper.writeValueAsString(normalized);
                return new EncryptedEnvironment(
                        List.copyOf(normalized.keySet()),
                        secretProtector.protect(plaintext)
                );
            } catch (JsonProcessingException error) {
                throw new IllegalArgumentException(
                        "stdio 环境变量无法保存", error
                );
            }
        }
        if (existing != null
                && normalizedTransportType(existing.transportType())
                == McpTransportType.STDIO
                && existing.environmentCiphertext() != null
                && !existing.environmentCiphertext().isBlank()) {
            return new EncryptedEnvironment(
                    safeList(existing.environmentKeys()),
                    existing.environmentCiphertext()
            );
        }
        return EncryptedEnvironment.empty();
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
        McpTransportType transportType = normalizedTransportType(
                stored.transportType()
        );
        McpAuthenticationType authType = normalizedAuthType(stored.authType());
        List<String> environmentKeys = safeList(stored.environmentKeys());
        return new McpServerConfiguration(
                stored.serverId(),
                stored.name(),
                stored.enabled(),
                transportType,
                stored.url(),
                stored.command(),
                safeList(stored.arguments()),
                stored.workingDirectory(),
                authType,
                stored.headerName(),
                transportType == McpTransportType.STREAMABLE_HTTP
                        && authType != McpAuthenticationType.NONE
                        && stored.credentialCiphertext() != null
                        && !stored.credentialCiphertext().isBlank(),
                environmentKeys,
                transportType == McpTransportType.STDIO
                        && stored.environmentCiphertext() != null
                        && !stored.environmentCiphertext().isBlank()
        );
    }

    private McpServerRuntimeConfiguration toRuntime(
            StoredMcpServerConfiguration stored
    ) {
        McpTransportType transportType = normalizedTransportType(
                stored.transportType()
        );
        McpAuthenticationType authType = normalizedAuthType(stored.authType());
        String credential = transportType != McpTransportType.STREAMABLE_HTTP
                || authType == McpAuthenticationType.NONE
                ? null
                : secretProtector.unprotect(stored.credentialCiphertext());
        return new McpServerRuntimeConfiguration(
                stored.serverId(),
                stored.name(),
                stored.enabled(),
                transportType,
                stored.url(),
                stored.command(),
                safeList(stored.arguments()),
                stored.workingDirectory(),
                authType,
                stored.headerName(),
                credential,
                transportType == McpTransportType.STDIO
                        ? decryptEnvironment(stored)
                        : Map.of()
        );
    }

    private Map<String, String> decryptEnvironment(
            StoredMcpServerConfiguration stored
    ) {
        if (stored.environmentCiphertext() == null
                || stored.environmentCiphertext().isBlank()) {
            return Map.of();
        }
        String plaintext = secretProtector.unprotect(
                stored.environmentCiphertext()
        );
        try {
            return Map.copyOf(normalizeEnvironment(
                    objectMapper.readValue(plaintext, ENVIRONMENT_TYPE)
            ));
        } catch (JsonProcessingException error) {
            throw new IllegalStateException(
                    "stdio 环境变量配置无法读取", error
            );
        }
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

    private static McpTransportType normalizedTransportType(
            McpTransportType transportType
    ) {
        return transportType == null
                ? McpTransportType.STREAMABLE_HTTP
                : transportType;
    }

    private static List<String> normalizeArguments(List<String> values) {
        if (values == null) return List.of();
        if (values.size() > 64) {
            throw new IllegalArgumentException("stdio 参数数量超过限制");
        }
        List<String> normalized = new ArrayList<>(values.size());
        for (String value : values) {
            requireProcessText(value, "stdio 参数", 2000);
            normalized.add(value);
        }
        return List.copyOf(normalized);
    }

    private static String normalizeWorkingDirectory(String value) {
        String normalized = blankToNull(value);
        if (normalized == null) return null;
        try {
            Path path = Path.of(normalized);
            if (!path.isAbsolute()) {
                throw new IllegalArgumentException(
                        "stdio 工作目录必须是绝对路径"
                );
            }
            return path.normalize().toString();
        } catch (InvalidPathException error) {
            throw new IllegalArgumentException(
                    "stdio 工作目录格式无效", error
            );
        }
    }

    private static Map<String, String> normalizeEnvironment(
            Map<String, String> values
    ) {
        if (values.size() > 64) {
            throw new IllegalArgumentException("stdio 环境变量数量超过限制");
        }
        Map<String, String> normalized = new TreeMap<>(
                String.CASE_INSENSITIVE_ORDER
        );
        for (Map.Entry<String, String> entry : values.entrySet()) {
            String key = requireText(entry.getKey(), "stdio 环境变量名称");
            if (!key.matches("[A-Za-z_][A-Za-z0-9_]{0,127}")) {
                throw new IllegalArgumentException(
                        "stdio 环境变量名称无效: " + key
                );
            }
            String value = entry.getValue();
            if (value == null || value.length() > 4096
                    || value.indexOf('\0') >= 0) {
                throw new IllegalArgumentException(
                        "stdio 环境变量值无效: " + key
                );
            }
            if (normalized.put(key, value) != null) {
                throw new IllegalArgumentException(
                        "stdio 环境变量名称重复: " + key
                );
            }
        }
        return normalized;
    }

    private static void requireProcessText(
            String value,
            String label,
            int maxLength
    ) {
        if (value == null || value.length() > maxLength
                || value.indexOf('\0') >= 0
                || value.indexOf('\r') >= 0
                || value.indexOf('\n') >= 0) {
            throw new IllegalArgumentException(label + "格式无效");
        }
    }

    private static List<String> safeList(List<String> values) {
        return values == null ? List.of() : List.copyOf(values);
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
            McpTransportType transportType,
            String url,
            String command,
            List<String> arguments,
            String workingDirectory,
            McpAuthenticationType authType,
            String headerName,
            String credentialCiphertext,
            List<String> environmentKeys,
            String environmentCiphertext
    ) { }

    private record EncryptedEnvironment(
            List<String> keys,
            String ciphertext
    ) {
        private static EncryptedEnvironment empty() {
            return new EncryptedEnvironment(List.of(), null);
        }
    }
}
