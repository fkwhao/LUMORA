ALTER TABLE conversation_message
ADD COLUMN run_id TEXT NOT NULL DEFAULT '';

CREATE INDEX idx_conversation_message_run
    ON conversation_message(conversation_id, run_id, sequence);

CREATE TABLE conversation_run_change_set (
    run_id TEXT NOT NULL PRIMARY KEY,
    task_id TEXT NOT NULL,
    repository_root TEXT NOT NULL DEFAULT '',
    before_tree TEXT NOT NULL DEFAULT '',
    after_tree TEXT NOT NULL DEFAULT '',
    before_head TEXT NOT NULL DEFAULT '',
    after_head TEXT NOT NULL DEFAULT '',
    before_index_tree TEXT NOT NULL DEFAULT '',
    after_index_tree TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    captured_at TEXT,
    reverted_at TEXT,
    FOREIGN KEY (run_id) REFERENCES conversation_run(run_id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES agent_task(task_id)
);

CREATE INDEX idx_run_change_set_repository_status
    ON conversation_run_change_set(repository_root, status, updated_at);
