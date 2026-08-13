package com.lumora.core.model.application.port;

import com.lumora.core.model.domain.model.ModelConnection;

/**
 * Resolves the active model connection for one runtime call.
 */
public interface ModelConnectionResolver {

    ModelConnection resolve(String modelOverride);
}
