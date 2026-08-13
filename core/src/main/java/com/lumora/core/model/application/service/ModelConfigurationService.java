package com.lumora.core.model.application.service;

import com.lumora.core.model.domain.model.ModelProvider;
import com.lumora.core.model.domain.model.ModelSettings;
import com.lumora.core.model.domain.model.ProviderModel;

import java.util.List;

/**
 * Manages persisted model providers and their selectable model settings.
 */
public interface ModelConfigurationService {

    List<ModelProvider> listProviders(String correlationId);

    ModelProvider createProvider(String providerName, String baseUrl,
                                 String model, int contextWindow, String apiFormat, String apiKey,
                                 String correlationId);

    ModelProvider updateProvider(String providerId, String providerName,
                                 String baseUrl, String model, int contextWindow, String apiFormat,
                                 String apiKey, String correlationId);

    ModelProvider activateProvider(String providerId, String correlationId);

    ModelProvider disableProvider(String providerId, String correlationId);

    void deleteProvider(String providerId, String correlationId);

    List<String> listProviderModels(String providerId, String apiKey,
                                    String correlationId);

    ProviderModel createProviderModel(String providerId, String modelId,
                                      int contextWindow, int maxOutputTokens,
                                      List<String> reasoningEfforts, boolean webSearchEnabled,
                                      String correlationId);

    ProviderModel updateProviderModel(String providerId,
                                      String modelConfigurationId, String modelId, int contextWindow,
                                      int maxOutputTokens, List<String> reasoningEfforts,
                                      boolean webSearchEnabled, String correlationId);

    void deleteProviderModel(String providerId, String modelConfigurationId,
                             String correlationId);

    boolean testProviderModel(String providerId, String modelConfigurationId,
                              String correlationId);

    List<String> listModels(String providerName, String baseUrl,
                            String apiFormat, String apiKey,
                            String correlationId);

    ModelSettings getSettings(String correlationId);

    ModelSettings updateSettings(String providerName, String baseUrl,
                                 String model, int contextWindow, String apiKey,
                                 String correlationId);
}
