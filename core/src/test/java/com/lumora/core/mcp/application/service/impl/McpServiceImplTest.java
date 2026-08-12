package com.lumora.core.mcp.application.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lumora.core.agent.client.AgentRuntimeClient;
import com.lumora.core.mcp.api.dto.request.SaveMcpServerRequest;
import com.lumora.core.mcp.domain.model.McpAuthenticationType;
import com.lumora.core.mcp.domain.model.McpConnectionTest;
import com.lumora.core.mcp.domain.model.McpServerConfiguration;
import com.lumora.core.mcp.domain.model.McpServerRuntimeConfiguration;
import com.lumora.core.shared.security.secret.SecretProtector;
import com.lumora.core.shared.settings.domain.ApplicationSetting;
import com.lumora.core.shared.settings.infrastructure.ApplicationSettingMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
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
    private final McpServiceImpl service = new McpServiceImpl(
            settingMapper,
            new ObjectMapper(),
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
}
