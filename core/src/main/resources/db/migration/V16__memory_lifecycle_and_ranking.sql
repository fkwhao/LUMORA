ALTER TABLE memory_item ADD COLUMN importance REAL NOT NULL DEFAULT 0.5;
ALTER TABLE memory_item ADD COLUMN usage_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE memory_item ADD COLUMN last_used_at TEXT;
ALTER TABLE memory_item ADD COLUMN source_type TEXT NOT NULL DEFAULT 'LEGACY';
ALTER TABLE memory_item ADD COLUMN source_reference TEXT;

CREATE INDEX idx_memory_item_retrieval
    ON memory_item(scope_type, scope_id, status, importance DESC,
        confidence DESC, updated_at DESC);
