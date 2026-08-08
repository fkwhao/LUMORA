package com.lumora.core.memory.api.dto.request;

import jakarta.validation.constraints.NotNull;

public class UpdateMemorySettingsRequest {

    @NotNull
    private Boolean enabled;

    public Boolean getEnabled() { return enabled; }
    public void setEnabled(Boolean enabled) { this.enabled = enabled; }
}
