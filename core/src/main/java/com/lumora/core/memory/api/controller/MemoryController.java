package com.lumora.core.memory.api.controller;

import com.lumora.core.shared.api.constant.ApiPathConstants;
import com.lumora.core.shared.api.constant.HttpContractConstants;
import com.lumora.core.memory.api.dto.request.UpdateMemorySettingsRequest;
import com.lumora.core.memory.api.dto.response.MemoryResetResponse;
import com.lumora.core.memory.api.dto.response.MemorySettingsResponse;
import com.lumora.core.memory.application.service.MemoryService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping(ApiPathConstants.MEMORY)
public class MemoryController {

    private final MemoryService memoryService;

    @GetMapping("/settings")
    public MemorySettingsResponse getSettings(
            @RequestHeader(HttpContractConstants.CORRELATION_ID_HEADER)
            String correlationId
    ) {
        return MemorySettingsResponse.fromModel(memoryService.getSettings());
    }

    @PutMapping("/settings")
    public MemorySettingsResponse updateSettings(
            @Valid @RequestBody UpdateMemorySettingsRequest request,
            @RequestHeader(HttpContractConstants.CORRELATION_ID_HEADER)
            String correlationId
    ) {
        return MemorySettingsResponse.fromModel(
                memoryService.updateSettings(request.getEnabled())
        );
    }

    @DeleteMapping
    public MemoryResetResponse reset(
            @RequestHeader(HttpContractConstants.CORRELATION_ID_HEADER)
            String correlationId
    ) {
        return new MemoryResetResponse(memoryService.reset());
    }
}
