CREATE TABLE conversation (
    conversation_id TEXT NOT NULL PRIMARY KEY,
    task_id TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (task_id) REFERENCES agent_task(task_id)
);

CREATE TABLE conversation_message (
    message_id TEXT NOT NULL PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT '',
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    UNIQUE (conversation_id, sequence),
    FOREIGN KEY (conversation_id) REFERENCES conversation(conversation_id)
);

CREATE INDEX idx_conversation_message_sequence
    ON conversation_message(conversation_id, sequence);
