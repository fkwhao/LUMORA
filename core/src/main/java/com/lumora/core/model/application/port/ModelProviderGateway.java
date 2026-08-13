package com.lumora.core.model.application.port;

import com.lumora.core.model.domain.model.ModelConnection;

import java.util.List;

/**
 * Provider operations needed while configuring models.
 */
public interface ModelProviderGateway {

    List<String> listModels(String providerName, String baseUrl,
                            String apiKey, String apiFormat, String correlationId);

    void testConnection(ModelConnection connection, String correlationId);
}
