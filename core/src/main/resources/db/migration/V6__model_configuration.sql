CREATE TABLE model_configuration (
    configuration_id TEXT NOT NULL PRIMARY KEY,
    provider_name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    model_name TEXT NOT NULL,
    api_key_ciphertext TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
