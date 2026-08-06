package com.lumora.core.dto.response;

import com.lumora.core.model.MemorySettings;

public record MemorySettingsResponse(boolean enabled) {

    public static MemorySettingsResponse fromModel(MemorySettings settings) {
        return new MemorySettingsResponse(settings.enabled());
    }
}
