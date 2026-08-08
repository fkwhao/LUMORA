package com.lumora.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public class UpdateTaskPreferencesRequest {

    @NotBlank
    @Size(max = 255)
    private String model;

    @Size(max = 64)
    @Pattern(regexp = "^$|^[A-Za-z0-9._-]+$")
    private String reasoningEffort = "";

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public String getReasoningEffort() {
        return reasoningEffort;
    }

    public void setReasoningEffort(String reasoningEffort) {
        this.reasoningEffort = reasoningEffort;
    }
}
