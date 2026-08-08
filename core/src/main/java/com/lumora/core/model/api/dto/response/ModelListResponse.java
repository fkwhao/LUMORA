package com.lumora.core.model.api.dto.response;

import java.util.List;

public class ModelListResponse {

    private final List<String> models;

    public ModelListResponse(List<String> models) {
        this.models = List.copyOf(models);
    }

    public List<String> getModels() {
        return models;
    }
}
