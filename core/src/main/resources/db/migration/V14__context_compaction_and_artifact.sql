CREATE TABLE conversation_context_summary (
    summary_id TEXT NOT NULL PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    from_sequence INTEGER NOT NULL DEFAULT 1,
    through_sequence INTEGER NOT NULL,
    summary_text TEXT NOT NULL,
    before_tokens INTEGER NOT NULL DEFAULT 0,
    after_tokens INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TEXT NOT NULL,
    UNIQUE (conversation_id, version),
    FOREIGN KEY (conversation_id) REFERENCES conversation(conversation_id)
);

CREATE INDEX idx_context_summary_conversation_version
    ON conversation_context_summary(conversation_id, version DESC);

CREATE TABLE artifact (
    artifact_id TEXT NOT NULL PRIMARY KEY,
    task_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    storage_scope_id TEXT NOT NULL,
    source_tool_call_id TEXT NOT NULL DEFAULT '',
    mime_type TEXT NOT NULL DEFAULT 'text/plain',
    byte_size INTEGER NOT NULL DEFAULT 0,
    character_count INTEGER NOT NULL DEFAULT 0,
    estimated_tokens INTEGER NOT NULL DEFAULT 0,
    sha256 TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'READY',
    created_at TEXT NOT NULL,
    FOREIGN KEY (task_id) REFERENCES agent_task(task_id),
    FOREIGN KEY (conversation_id) REFERENCES conversation(conversation_id)
);

CREATE INDEX idx_artifact_task_created
    ON artifact(task_id, created_at DESC);
