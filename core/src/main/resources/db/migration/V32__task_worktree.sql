ALTER TABLE conversation_run_change_set
ADD COLUMN workspace_path TEXT NOT NULL DEFAULT '';

UPDATE conversation_run_change_set
SET workspace_path = repository_root
WHERE workspace_path = '';

CREATE TABLE task_worktree (
    task_id TEXT NOT NULL PRIMARY KEY,
    workspace_mode TEXT NOT NULL,
    source_workspace_path TEXT NOT NULL,
    effective_workspace_path TEXT NOT NULL,
    repository_root TEXT NOT NULL DEFAULT '',
    base_commit TEXT NOT NULL DEFAULT '',
    base_tree TEXT NOT NULL DEFAULT '',
    result_tree TEXT NOT NULL DEFAULT '',
    worktree_state TEXT NOT NULL,
    branch_name TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    cleaned_at TEXT,
    FOREIGN KEY (task_id) REFERENCES agent_task(task_id) ON DELETE CASCADE
);

CREATE INDEX idx_task_worktree_repository_state
    ON task_worktree(repository_root, worktree_state, updated_at);
