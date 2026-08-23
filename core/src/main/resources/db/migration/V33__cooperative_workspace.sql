ALTER TABLE task_worktree
    ADD COLUMN auto_apply_when_clean INTEGER NOT NULL DEFAULT 0;

ALTER TABLE task_worktree
    ADD COLUMN settings_revision INTEGER NOT NULL DEFAULT 0;

ALTER TABLE task_worktree
    ADD COLUMN managed_by_lumora INTEGER NOT NULL DEFAULT 1;

CREATE TABLE workspace_revision (
    workspace_key TEXT NOT NULL PRIMARY KEY,
    revision INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);

CREATE TABLE workspace_run_attribution (
    run_id TEXT NOT NULL PRIMARY KEY,
    task_id TEXT NOT NULL,
    workspace_key TEXT NOT NULL,
    repository_root TEXT NOT NULL DEFAULT '',
    workspace_path TEXT NOT NULL,
    before_revision INTEGER NOT NULL DEFAULT 0,
    after_revision INTEGER,
    changes_complete INTEGER NOT NULL DEFAULT 1,
    incomplete_reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY (task_id) REFERENCES agent_task(task_id) ON DELETE CASCADE,
    FOREIGN KEY (run_id) REFERENCES conversation_run(run_id) ON DELETE CASCADE
);

CREATE TABLE workspace_change_event (
    change_id TEXT NOT NULL PRIMARY KEY,
    workspace_key TEXT NOT NULL,
    repository_root TEXT NOT NULL DEFAULT '',
    workspace_path TEXT NOT NULL,
    task_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    tool_call_id TEXT NOT NULL DEFAULT '',
    agent_id TEXT NOT NULL DEFAULT '',
    path TEXT NOT NULL,
    operation TEXT NOT NULL DEFAULT 'MODIFIED',
    previous_path TEXT NOT NULL DEFAULT '',
    before_hash TEXT NOT NULL DEFAULT '',
    after_hash TEXT NOT NULL DEFAULT '',
    before_blob TEXT NOT NULL DEFAULT '',
    after_blob TEXT NOT NULL DEFAULT '',
    before_content TEXT NOT NULL DEFAULT '',
    after_content TEXT NOT NULL DEFAULT '',
    patch TEXT NOT NULL DEFAULT '',
    patch_truncated INTEGER NOT NULL DEFAULT 0,
    binary INTEGER NOT NULL DEFAULT 0,
    additions INTEGER NOT NULL DEFAULT 0,
    deletions INTEGER NOT NULL DEFAULT 0,
    revision INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (task_id) REFERENCES agent_task(task_id) ON DELETE CASCADE,
    FOREIGN KEY (run_id) REFERENCES conversation_run(run_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX uq_workspace_change_run_tool_path
    ON workspace_change_event(run_id, tool_call_id, path, revision);

CREATE INDEX idx_workspace_change_run_revision
    ON workspace_change_event(run_id, revision);

CREATE INDEX idx_workspace_change_workspace_revision
    ON workspace_change_event(workspace_key, revision);
