package com.lumora.core.service.impl;

import com.lumora.core.agent.client.AgentRuntimeClient;
import com.lumora.core.entity.ModelConfiguration;
import com.lumora.core.mapper.ModelConfigurationMapper;
import com.lumora.core.model.ModelSettings;
import com.lumora.core.security.secret.SecretProtector;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ModelServiceImplTest {

    private final AtomicReference<ModelConfiguration> stored =
            new AtomicReference<>();
    private ModelConfigurationMapper mapper;
    private SecretProtector protector;
    private ModelServiceImpl service;

    @BeforeEach
    void setUp() {
        mapper = mock(ModelConfigurationMapper.class);
        protector = mock(SecretProtector.class);
        AgentRuntimeClient runtimeClient = mock(AgentRuntimeClient.class);
        when(mapper.selectById("default")).thenAnswer(
                invocation -> stored.get()
        );
        doAnswer(invocation -> {
            stored.set(invocation.getArgument(0));
            return 1;
        }).when(mapper).insert(any(ModelConfiguration.class));
        doAnswer(invocation -> {
            stored.set(invocation.getArgument(0));
            return 1;
        }).when(mapper).updateById(any(ModelConfiguration.class));
        when(protector.protect("provider-secret"))
                .thenReturn("dpapi-ciphertext");

        service = new ModelServiceImpl(
                mapper,
                protector,
                runtimeClient,
                Clock.fixed(
                        Instant.parse("2026-07-30T01:02:03Z"),
                        ZoneOffset.UTC
                )
        );
    }

    @Test
    void encryptsApiKeyBeforePersistingConfiguration() {
        ModelSettings result = service.updateSettings(
                "DeepSeek",
                "https://api.deepseek.com/",
                "deepseek-v4-pro",
                "provider-secret",
                "correlation-123"
        );

        ModelConfiguration configuration = stored.get();
        assertThat(configuration.getApiKeyCiphertext())
                .isEqualTo("dpapi-ciphertext")
                .doesNotContain("provider-secret");
        assertThat(configuration.getBaseUrl())
                .isEqualTo("https://api.deepseek.com");
        assertThat(result.isApiKeyConfigured()).isTrue();
        verify(protector).protect("provider-secret");
    }

    @Test
    void blankApiKeyPreservesExistingCiphertext() {
        service.updateSettings(
                "DeepSeek",
                "https://api.deepseek.com",
                "deepseek-v4-pro",
                "provider-secret",
                "correlation-123"
        );

        service.updateSettings(
                "DeepSeek",
                "https://api.deepseek.com",
                "deepseek-v4-flash",
                "",
                "correlation-456"
        );

        assertThat(stored.get().getApiKeyCiphertext())
                .isEqualTo("dpapi-ciphertext");
        assertThat(stored.get().getModelName())
                .isEqualTo("deepseek-v4-flash");
    }
}
