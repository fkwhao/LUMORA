package com.lumora.core.memory.api.dto.response;

import com.lumora.core.memory.domain.model.MemorySettings;

public record MemorySettingsResponse(boolean enabled) {

    public static MemorySettingsResponse fromModel(MemorySettings settings) {
        return new MemorySettingsResponse(settings.enabled());
    }
}
