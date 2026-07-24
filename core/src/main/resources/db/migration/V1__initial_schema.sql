PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS agent_task (
    task_id TEXT PRIMARY KEY,
    goal TEXT NOT NULL,
    status TEXT NOT NULL,
    last_event_sequence INTEGER NOT NULL DEFAULT 0,
    active_step TEXT NOT NULL DEFAULT '',
    result_summary TEXT NOT NULL DEFAULT '',
    failure_reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_event (
    task_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    status TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    user_message TEXT NOT NULL DEFAULT '',
    occurred_at TEXT NOT NULL,
    PRIMARY KEY (task_id, sequence),
    FOREIGN KEY (task_id) REFERENCES agent_task(task_id)
);

CREATE TABLE IF NOT EXISTS approval_request (
    approval_id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    action TEXT NOT NULL,
    impact_summary TEXT NOT NULL,
    risk_level TEXT NOT NULL,
    reversible INTEGER NOT NULL,
    decision TEXT,
    created_at TEXT NOT NULL,
    decided_at TEXT,
    FOREIGN KEY (task_id) REFERENCES agent_task(task_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
    audit_id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    action TEXT NOT NULL,
    decision TEXT NOT NULL,
    correlation_id TEXT NOT NULL,
    impact_summary TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    FOREIGN KEY (task_id) REFERENCES agent_task(task_id)
);

