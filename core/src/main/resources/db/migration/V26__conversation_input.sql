CREATE TABLE conversation_input (
    input_id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    run_id TEXT,
    target TEXT NOT NULL,
    status TEXT NOT NULL,
    content TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT '',
    reasoning_effort TEXT NOT NULL DEFAULT '',
    workspace_path TEXT NOT NULL DEFAULT '',
    permission_mode TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    claimed_at TEXT,
    FOREIGN KEY (task_id) REFERENCES agent_task(task_id),
    FOREIGN KEY (run_id) REFERENCES conversation_run(run_id) ON DELETE SET NULL
);

CREATE INDEX idx_conversation_input_task_queue
    ON conversation_input(task_id, status, position, created_at);

CREATE INDEX idx_conversation_input_run_queue
    ON conversation_input(run_id, target, status, position);
