ALTER TABLE model_configuration
    ADD COLUMN api_format TEXT NOT NULL DEFAULT 'chat-completions';

ALTER TABLE model_configuration
    ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;

CREATE INDEX idx_model_configuration_active
    ON model_configuration (is_active);
