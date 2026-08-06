CREATE TABLE application_setting (
    setting_key TEXT NOT NULL PRIMARY KEY,
    setting_value TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

INSERT INTO application_setting (
    setting_key,
    setting_value,
    created_at,
    updated_at
) VALUES (
    'memory.enabled',
    'true',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);
