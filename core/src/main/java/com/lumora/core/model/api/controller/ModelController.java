package com.lumora.core.model.api.controller;

import com.lumora.core.shared.api.constant.ApiPathConstants;
import com.lumora.core.shared.api.constant.HttpContractConstants;
import com.lumora.core.model.api.dto.request.UpdateModelSettingsRequest;
import com.lumora.core.model.api.dto.request.ListModelsRequest;
import com.lumora.core.model.api.dto.request.ListProviderModelsRequest;
import com.lumora.core.model.api.dto.request.SaveModelProviderRequest;
import com.lumora.core.model.api.dto.request.SaveProviderModelRequest;
import com.lumora.core.model.api.dto.response.ModelSettingsResponse;
import com.lumora.core.model.api.dto.response.ModelListResponse;
import com.lumora.core.model.api.dto.response.ModelProviderResponse;
import com.lumora.core.model.api.dto.response.ProviderModelResponse;
import com.lumora.core.model.domain.model.ModelSettings;
import com.lumora.core.model.application.service.ModelService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequiredArgsConstructor
@RequestMapping(ApiPathConstants.MODEL_SETTINGS)
public class ModelController {

    private final ModelService modelService;

    @GetMapping("/providers")
    public List<ModelProviderResponse> listProviders(
            @RequestHeader(HttpContractConstants.CORRELATION_ID_HEADER)
            String correlationId
    ) {
        return modelService.listProviders(correlationId).stream()
                .map(ModelProviderResponse::fromModel)
                .toList();
    }

    @PostMapping("/providers")
    public ModelProviderResponse createProvider(
            @Valid @RequestBody SaveModelProviderRequest request,
            @RequestHeader(HttpContractConstants.CORRELATION_ID_HEADER)
            String correlationId
    ) {
        return ModelProviderResponse.fromModel(modelService.createProvider(
                request.getProviderName(), request.getBaseUrl(),
                request.getModel(), request.getContextWindow(),
                request.getApiFormat(), request.getApiKey(), correlationId));
    }

    @PutMapping("/providers/{providerId}")
    public ModelProviderResponse updateProvider(
            @PathVariable String providerId,
            @Valid @RequestBody SaveModelProviderRequest request,
            @RequestHeader(HttpContractConstants.CORRELATION_ID_HEADER)
            String correlationId
    ) {
        return ModelProviderResponse.fromModel(modelService.updateProvider(
                providerId, request.getProviderName(), request.getBaseUrl(),
                request.getModel(), request.getContextWindow(),
                request.getApiFormat(), request.getApiKey(), correlationId));
    }

    @PostMapping("/providers/{providerId}/activate")
    public ModelProviderResponse activateProvider(
            @PathVariable String providerId,
            @RequestHeader(HttpContractConstants.CORRELATION_ID_HEADER)
            String correlationId
    ) {
        return ModelProviderResponse.fromModel(
                modelService.activateProvider(providerId, correlationId));
    }

    @PostMapping("/providers/{providerId}/disable")
    public ModelProviderResponse disableProvider(
            @PathVariable String providerId,
            @RequestHeader(HttpContractConstants.CORRELATION_ID_HEADER)
            String correlationId
    ) {
        return ModelProviderResponse.fromModel(
                modelService.disableProvider(providerId, correlationId));
    }

    @DeleteMapping("/providers/{providerId}")
    public Map<String, Boolean> deleteProvider(
            @PathVariable String providerId,
            @RequestHeader(HttpContractConstants.CORRELATION_ID_HEADER)
            String correlationId
    ) {
        modelService.deleteProvider(providerId, correlationId);
        return Map.of("deleted", true);
    }

    @PostMapping("/providers/{providerId}/models")
    public ModelListResponse listProviderModels(
            @PathVariable String providerId,
            @Valid @RequestBody ListProviderModelsRequest request,
            @RequestHeader(HttpContractConstants.CORRELATION_ID_HEADER)
            String correlationId
    ) {
        return new ModelListResponse(modelService.listProviderModels(
                providerId, request.getApiKey(), correlationId));
    }

    @PostMapping("/providers/{providerId}/model-configurations")
    public ProviderModelResponse createProviderModel(
            @PathVariable String providerId,
            @Valid @RequestBody SaveProviderModelRequest request,
            @RequestHeader(HttpContractConstants.CORRELATION_ID_HEADER)
            String correlationId
    ) {
        return ProviderModelResponse.fromModel(modelService.createProviderModel(
                providerId, request.getModelId(), request.getContextWindow(),
                request.getMaxOutputTokens(), request.getReasoningEfforts(),
                request.isWebSearchEnabled(),
                correlationId));
    }

    @PutMapping("/providers/{providerId}/model-configurations/{modelConfigurationId}")
    public ProviderModelResponse updateProviderModel(
            @PathVariable String providerId,
            @PathVariable String modelConfigurationId,
            @Valid @RequestBody SaveProviderModelRequest request,
            @RequestHeader(HttpContractConstants.CORRELATION_ID_HEADER)
            String correlationId
    ) {
        return ProviderModelResponse.fromModel(modelService.updateProviderModel(
                providerId, modelConfigurationId, request.getModelId(),
                request.getContextWindow(), request.getMaxOutputTokens(),
                request.getReasoningEfforts(), request.isWebSearchEnabled(),
                correlationId));
    }

    @DeleteMapping("/providers/{providerId}/model-configurations/{modelConfigurationId}")
    public Map<String, Boolean> deleteProviderModel(
            @PathVariable String providerId,
            @PathVariable String modelConfigurationId,
            @RequestHeader(HttpContractConstants.CORRELATION_ID_HEADER)
            String correlationId
    ) {
        modelService.deleteProviderModel(providerId, modelConfigurationId,
                correlationId);
        return Map.of("deleted", true);
    }

    @PostMapping("/providers/{providerId}/model-configurations/{modelConfigurationId}/test")
    public Map<String, Boolean> testProviderModel(
            @PathVariable String providerId,
            @PathVariable String modelConfigurationId,
            @RequestHeader(HttpContractConstants.CORRELATION_ID_HEADER)
            String correlationId
    ) {
        return Map.of("connected", modelService.testProviderModel(
                providerId, modelConfigurationId, correlationId));
    }

    @PostMapping(ApiPathConstants.MODEL_LIST)
    public ModelListResponse listModels(
            @Valid @RequestBody ListModelsRequest request,
            @RequestHeader(HttpContractConstants.CORRELATION_ID_HEADER)
            String correlationId
    ) {
        return new ModelListResponse(modelService.listModels(
                request.getProviderName(),
                request.getBaseUrl(),
                request.getApiKey(),
                correlationId
        ));
    }

    @GetMapping
    public ModelSettingsResponse getSettings(
            @RequestHeader(HttpContractConstants.CORRELATION_ID_HEADER)
            String correlationId
    ) {
        return ModelSettingsResponse.fromModel(
                modelService.getSettings(correlationId)
        );
    }

    @PutMapping
    public ModelSettingsResponse updateSettings(
            @Valid @RequestBody UpdateModelSettingsRequest request,
            @RequestHeader(HttpContractConstants.CORRELATION_ID_HEADER)
            String correlationId
    ) {
        ModelSettings settings = modelService.updateSettings(
                request.getProviderName(),
                request.getBaseUrl(),
                request.getModel(),
                request.getContextWindow(),
                request.getApiKey(),
                correlationId
        );
        return ModelSettingsResponse.fromModel(settings);
    }
}
