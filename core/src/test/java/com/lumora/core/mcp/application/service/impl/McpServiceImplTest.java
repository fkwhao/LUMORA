package com.lumora.core.mcp.application.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lumora.core.agent.client.AgentRuntimeClient;
import com.lumora.core.agent.dto.request.AgentMcpServerRequest;
import com.lumora.core.mcp.api.dto.request.SaveMcpServerRequest;
import com.lumora.core.mcp.domain.model.McpAuthenticationType;
import com.lumora.core.mcp.domain.model.McpConnectionTest;
import com.lumora.core.mcp.domain.model.McpServerConfiguration;
import com.lumora.core.mcp.domain.model.McpServerRuntimeConfiguration;
import com.lumora.core.mcp.domain.model.McpTransportType;
import com.lumora.core.shared.security.secret.SecretProtector;
import com.lumora.core.shared.settings.domain.ApplicationSetting;
import com.lumora.core.shared.settings.infrastructure.ApplicationSettingMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class McpServiceImplTest {
    private final ApplicationSettingMapper settingMapper =
            mock(ApplicationSettingMapper.class);
    private final AgentRuntimeClient agentRuntimeClient =
            mock(AgentRuntimeClient.class);
    private final SecretProtector secretProtector = mock(SecretProtector.class);
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final McpServiceImpl service = new McpServiceImpl(
            settingMapper,
            objectMapper,
            agentRuntimeClient,
            Clock.fixed(Instant.parse("2026-08-11T00:00:00Z"), ZoneOffset.UTC),
            secretProtector
    );

    @Test
    void encryptsStaticCredentialAndNeverReturnsIt() {
        SaveMcpServerRequest request = new SaveMcpServerRequest();
        request.setName("Remote Echo");
        request.setEnabled(true);
        request.setUrl("http://127.0.0.1:8765/mcp");
        request.setAuthType("bearer");
        request.setCredential("secret-token");
        when(secretProtector.protect("secret-token")).thenReturn("dpapi-ciphertext");

        McpServerConfiguration saved = service.save("remote-echo", request);

        assertEquals(McpAuthenticationType.BEARER, saved.authType());
        assertTrue(saved.credentialConfigured());
        ArgumentCaptor<ApplicationSetting> captor =
                ArgumentCaptor.forClass(ApplicationSetting.class);
        verify(settingMapper).insert(captor.capture());
        String persisted = captor.getValue().getSettingValue();
        assertTrue(persisted.contains("dpapi-ciphertext"));
        assertFalse(persisted.contains("secret-token"));
    }

    @Test
    void decryptsCredentialOnlyForAgentRuntime() {
        String stored = """
                [{
                  "serverId":"remote-echo",
                  "name":"Remote Echo",
                  "enabled":true,
                  "url":"http://127.0.0.1:8765/mcp",
                  "authType":"api_key",
                  "headerName":"X-API-Key",
                  "credentialCiphertext":"dpapi-ciphertext"
                }]
                """;
        when(settingMapper.selectById("mcp.servers")).thenReturn(
                new ApplicationSetting(
                        "mcp.servers", stored, Instant.EPOCH, Instant.EPOCH
                )
        );
        when(secretProtector.unprotect("dpapi-ciphertext"))
                .thenReturn("secret-key");
        McpConnectionTest expected = new McpConnectionTest(
                true,
                "Echo",
                "0.2.0",
                List.of("echo"),
                List.of("lumora://test/welcome"),
                List.of("lumora://test/echo/{text}"),
                List.of("summarize_resource"),
                "ok"
        );
        when(agentRuntimeClient.testMcpServer(any(), any())).thenReturn(expected);

        assertEquals(expected, service.test("remote-echo", "correlation-1"));
        ArgumentCaptor<McpServerRuntimeConfiguration> runtime =
                ArgumentCaptor.forClass(McpServerRuntimeConfiguration.class);
        verify(agentRuntimeClient).testMcpServer(runtime.capture(), any());
        assertEquals("secret-key", runtime.getValue().credential());
        assertEquals("X-API-Key", runtime.getValue().headerName());
    }

    @Test
    void preservesEncryptedCredentialWhenEditingTheSameAuthenticationType() {
        String stored = """
                [{
                  "serverId":"remote-echo",
                  "name":"Remote Echo",
                  "enabled":true,
                  "url":"http://127.0.0.1:8765/mcp",
                  "authType":"bearer",
                  "credentialCiphertext":"dpapi-ciphertext"
                }]
                """;
        ApplicationSetting setting = new ApplicationSetting(
                "mcp.servers", stored, Instant.EPOCH, Instant.EPOCH
        );
        when(settingMapper.selectById("mcp.servers")).thenReturn(setting);
        SaveMcpServerRequest request = new SaveMcpServerRequest();
        request.setName("Renamed Echo");
        request.setEnabled(false);
        request.setUrl("http://127.0.0.1:8765/mcp");
        request.setAuthType("bearer");

        McpServerConfiguration saved = service.save("remote-echo", request);

        assertTrue(saved.credentialConfigured());
        assertTrue(setting.getSettingValue().contains("dpapi-ciphertext"));
    }

    @Test
    void requiresANewCredentialWhenAuthenticationTypeChanges() {
        String stored = """
                [{
                  "serverId":"remote-echo",
                  "name":"Remote Echo",
                  "enabled":true,
                  "url":"http://127.0.0.1:8765/mcp",
                  "authType":"bearer",
                  "credentialCiphertext":"dpapi-ciphertext"
                }]
                """;
        when(settingMapper.selectById("mcp.servers")).thenReturn(
                new ApplicationSetting(
                        "mcp.servers", stored, Instant.EPOCH, Instant.EPOCH
                )
        );
        SaveMcpServerRequest request = new SaveMcpServerRequest();
        request.setName("Remote Echo");
        request.setEnabled(true);
        request.setUrl("http://127.0.0.1:8765/mcp");
        request.setAuthType("api_key");
        request.setHeaderName("X-API-Key");

        assertThrows(
                IllegalArgumentException.class,
                () -> service.save("remote-echo", request)
        );
    }

    @Test
    void encryptsStdioEnvironmentAndReturnsOnlyItsKeys() {
        SaveMcpServerRequest request = new SaveMcpServerRequest();
        request.setName("Local Tools");
        request.setEnabled(true);
        request.setTransportType("stdio");
        request.setCommand("python.exe");
        request.setArguments(List.of("-m", "local_tools"));
        request.setWorkingDirectory("F:\\project\\local-tools");
        request.setEnvironment(Map.of("API_TOKEN", "secret"));
        when(secretProtector.protect("{\"API_TOKEN\":\"secret\"}"))
                .thenReturn("environment-ciphertext");

        McpServerConfiguration saved = service.save("local-tools", request);

        assertEquals(McpTransportType.STDIO, saved.transportType());
        assertEquals("python.exe", saved.command());
        assertEquals(List.of("-m", "local_tools"), saved.arguments());
        assertEquals(List.of("API_TOKEN"), saved.environmentKeys());
        assertTrue(saved.environmentConfigured());
        assertEquals(McpAuthenticationType.NONE, saved.authType());
        ArgumentCaptor<ApplicationSetting> captor =
                ArgumentCaptor.forClass(ApplicationSetting.class);
        verify(settingMapper).insert(captor.capture());
        String persisted = captor.getValue().getSettingValue();
        assertTrue(persisted.contains("environment-ciphertext"));
        assertFalse(persisted.contains("secret"));
    }

    @Test
    void decryptsStdioEnvironmentOnlyForAgentRuntime() {
        String stored = """
                [{
                  "serverId":"local-tools",
                  "name":"Local Tools",
                  "enabled":true,
                  "transportType":"stdio",
                  "command":"python.exe",
                  "arguments":["-m","local_tools"],
                  "workingDirectory":"F:\\\\project\\\\local-tools",
                  "authType":"none",
                  "environmentKeys":["API_TOKEN"],
                  "environmentCiphertext":"environment-ciphertext"
                }]
                """;
        when(settingMapper.selectById("mcp.servers")).thenReturn(
                new ApplicationSetting(
                        "mcp.servers", stored, Instant.EPOCH, Instant.EPOCH
                )
        );
        when(secretProtector.unprotect("environment-ciphertext"))
                .thenReturn("{\"API_TOKEN\":\"secret\"}");
        McpConnectionTest expected = new McpConnectionTest(
                true,
                "Local Tools",
                "1.0.0",
                List.of("echo"),
                List.of(),
                List.of(),
                List.of(),
                null
        );
        when(agentRuntimeClient.testMcpServer(any(), any())).thenReturn(expected);

        assertEquals(expected, service.test("local-tools", "correlation-2"));
        ArgumentCaptor<McpServerRuntimeConfiguration> runtime =
                ArgumentCaptor.forClass(McpServerRuntimeConfiguration.class);
        verify(agentRuntimeClient).testMcpServer(runtime.capture(), any());
        assertEquals(McpTransportType.STDIO, runtime.getValue().transportType());
        assertEquals("python.exe", runtime.getValue().command());
        assertEquals(Map.of("API_TOKEN", "secret"),
                runtime.getValue().environment());
        assertNull(runtime.getValue().credential());
        var agentPayload = objectMapper.valueToTree(
                new AgentMcpServerRequest(runtime.getValue())
        );
        assertEquals("stdio", agentPayload.get("transportType").asText());
        assertEquals("python.exe", agentPayload.get("command").asText());
        assertEquals("secret",
                agentPayload.get("environment").get("API_TOKEN").asText());
    }

    @Test
    void rejectsFieldsFromTheOtherTransport() {
        SaveMcpServerRequest request = new SaveMcpServerRequest();
        request.setName("Remote");
        request.setTransportType("streamable_http");
        request.setUrl("https://mcp.example/mcp");
        request.setEnvironment(Map.of("TOKEN", "secret"));

        assertThrows(
                IllegalArgumentException.class,
                () -> service.save("remote", request)
        );
    }

    @Test
    void rejectsCaseInsensitiveDuplicateWindowsEnvironmentNames() {
        SaveMcpServerRequest request = new SaveMcpServerRequest();
        request.setName("Local Tools");
        request.setTransportType("stdio");
        request.setCommand("python.exe");
        request.setEnvironment(Map.of("Path", "one", "PATH", "two"));

        assertThrows(
                IllegalArgumentException.class,
                () -> service.save("local-tools", request)
        );
    }
}
