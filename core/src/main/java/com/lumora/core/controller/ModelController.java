package com.lumora.core.controller;

import com.lumora.core.common.constant.ApiPathConstants;
import com.lumora.core.common.constant.HttpContractConstants;
import com.lumora.core.dto.request.UpdateModelSettingsRequest;
import com.lumora.core.dto.response.ModelSettingsResponse;
import com.lumora.core.model.ModelSettings;
import com.lumora.core.service.ModelService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping(ApiPathConstants.MODEL_SETTINGS)
public class ModelController {

    private final ModelService modelService;

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
                request.getApiKey(),
                correlationId
        );
        return ModelSettingsResponse.fromModel(settings);
    }
}
