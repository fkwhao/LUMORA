CREATE TABLE agent_session (
    session_id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL UNIQUE,
    task_id TEXT NOT NULL,
    parent_session_id TEXT NOT NULL,
    parent_agent_id TEXT NOT NULL,
    label TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'continuable',
    status TEXT NOT NULL DEFAULT 'idle',
    delegation_depth INTEGER NOT NULL,
    model TEXT NOT NULL DEFAULT '',
    latest_report TEXT NOT NULL DEFAULT '',
    unread_report_count INTEGER NOT NULL DEFAULT 0,
    last_inbox_sequence INTEGER NOT NULL DEFAULT 0,
    consumed_inbox_sequence INTEGER NOT NULL DEFAULT 0,
    checkpoint_sequence INTEGER NOT NULL DEFAULT 0,
    active_activation_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    closed_at TEXT,
    FOREIGN KEY (task_id) REFERENCES agent_task(task_id)
);

CREATE INDEX idx_agent_session_task_status
    ON agent_session(task_id, status, updated_at);

CREATE TABLE agent_inbox_message (
    message_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    sender_agent_id TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    consumed_at TEXT,
    UNIQUE (session_id, sequence),
    FOREIGN KEY (session_id) REFERENCES agent_session(session_id) ON DELETE CASCADE
);

CREATE INDEX idx_agent_inbox_session_status
    ON agent_inbox_message(session_id, status, sequence);

CREATE TABLE agent_activation (
    activation_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    status TEXT NOT NULL,
    consumed_inbox_sequence INTEGER NOT NULL DEFAULT 0,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    error_message TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (session_id) REFERENCES agent_session(session_id) ON DELETE CASCADE,
    FOREIGN KEY (run_id) REFERENCES conversation_run(run_id) ON DELETE CASCADE
);

CREATE INDEX idx_agent_activation_session_started
    ON agent_activation(session_id, started_at);

CREATE TABLE agent_checkpoint (
    checkpoint_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    consumed_inbox_sequence INTEGER NOT NULL DEFAULT 0,
    transcript_json TEXT NOT NULL DEFAULT '[]',
    summary TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (session_id, sequence),
    FOREIGN KEY (session_id) REFERENCES agent_session(session_id) ON DELETE CASCADE
);

CREATE INDEX idx_agent_checkpoint_session_sequence
    ON agent_checkpoint(session_id, sequence DESC);
