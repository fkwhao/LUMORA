CREATE TABLE model_configuration_model (
    model_configuration_model_id TEXT NOT NULL PRIMARY KEY,
    configuration_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    context_window INTEGER NOT NULL,
    max_output_tokens INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CONSTRAINT fk_provider_model_configuration
        FOREIGN KEY (configuration_id)
        REFERENCES model_configuration(configuration_id)
        ON DELETE CASCADE,
    CONSTRAINT uq_provider_model UNIQUE (configuration_id, model_id)
);

INSERT INTO model_configuration_model (
    model_configuration_model_id,
    configuration_id,
    model_id,
    context_window,
    max_output_tokens,
    created_at,
    updated_at
)
SELECT
    lower(hex(randomblob(16))),
    configuration_id,
    model_name,
    context_window,
    8192,
    created_at,
    updated_at
FROM model_configuration
WHERE trim(model_name) <> '';

CREATE INDEX idx_provider_model_configuration
    ON model_configuration_model (configuration_id);
