ALTER TABLE memory_item ADD COLUMN dedupe_key TEXT NOT NULL DEFAULT '';
ALTER TABLE memory_item ADD COLUMN subject TEXT NOT NULL DEFAULT '';
ALTER TABLE memory_item ADD COLUMN predicate TEXT NOT NULL DEFAULT '';
ALTER TABLE memory_item ADD COLUMN value TEXT NOT NULL DEFAULT '';
ALTER TABLE memory_item ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX idx_memory_item_active_semantic_slot
    ON memory_item(scope_type, scope_id, memory_type, dedupe_key)
    WHERE status = 'ACTIVE' AND dedupe_key <> '';
