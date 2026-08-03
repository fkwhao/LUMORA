CREATE TABLE memory_item (
    memory_id TEXT NOT NULL PRIMARY KEY,
    scope_type TEXT NOT NULL,
    scope_id TEXT NOT NULL,
    memory_type TEXT NOT NULL,
    content TEXT NOT NULL,
    structured_data_json TEXT NOT NULL DEFAULT '{}',
    confidence REAL NOT NULL DEFAULT 1.0,
    source_message_id TEXT,
    content_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    expires_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (scope_type, scope_id, memory_type, content_hash),
    FOREIGN KEY (source_message_id)
        REFERENCES conversation_message(message_id)
        ON DELETE SET NULL,
    CHECK (confidence >= 0.0 AND confidence <= 1.0)
);

CREATE INDEX idx_memory_item_scope_status_updated
    ON memory_item(scope_type, scope_id, status, updated_at DESC);

CREATE INDEX idx_memory_item_source_message
    ON memory_item(source_message_id);
