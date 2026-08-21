CREATE TABLE agent_workflow (
    workflow_id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    owner_agent_id TEXT NOT NULL,
    label TEXT NOT NULL,
    status TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 0,
    scheduler_sequence INTEGER NOT NULL DEFAULT 0,
    quota_max_waves INTEGER NOT NULL,
    quota_max_attempts INTEGER NOT NULL,
    quota_max_runtime_ms INTEGER NOT NULL,
    quota_used_waves INTEGER NOT NULL DEFAULT 0,
    quota_used_attempts INTEGER NOT NULL DEFAULT 0,
    quota_used_runtime_ms INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (task_id) REFERENCES agent_task(task_id) ON DELETE CASCADE
);

CREATE INDEX idx_agent_workflow_task_status
    ON agent_workflow(task_id, status, updated_at DESC);

CREATE TABLE agent_workflow_node (
    node_key TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    title TEXT NOT NULL,
    prompt TEXT NOT NULL,
    depends_on_json TEXT NOT NULL DEFAULT '[]',
    priority INTEGER NOT NULL DEFAULT 0,
    deadline TEXT,
    retry_mode TEXT NOT NULL DEFAULT 'never',
    max_attempts INTEGER NOT NULL DEFAULT 1,
    write_scopes_json TEXT NOT NULL DEFAULT '[]',
    declared_write_scopes_json TEXT NOT NULL DEFAULT '[]',
    evidence_refs_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    result TEXT NOT NULL DEFAULT '',
    error_message TEXT NOT NULL DEFAULT '',
    failure_kind TEXT NOT NULL DEFAULT '',
    agent_id TEXT NOT NULL DEFAULT '',
    session_id TEXT NOT NULL DEFAULT '',
    effect_id TEXT NOT NULL DEFAULT '',
    effect_state TEXT NOT NULL DEFAULT 'not_started',
    dispatch_count INTEGER NOT NULL DEFAULT 0,
    dispatch_sequence INTEGER NOT NULL DEFAULT 0,
    ready_since TEXT,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    UNIQUE (workflow_id, node_id),
    FOREIGN KEY (workflow_id) REFERENCES agent_workflow(workflow_id) ON DELETE CASCADE
);

CREATE INDEX idx_agent_workflow_node_ready
    ON agent_workflow_node(workflow_id, status, dispatch_count, priority DESC);

CREATE TABLE agent_workflow_checkpoint (
    checkpoint_id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    reason TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (workflow_id, version),
    FOREIGN KEY (workflow_id) REFERENCES agent_workflow(workflow_id) ON DELETE CASCADE,
    FOREIGN KEY (run_id) REFERENCES conversation_run(run_id) ON DELETE CASCADE
);

CREATE INDEX idx_agent_workflow_checkpoint_latest
    ON agent_workflow_checkpoint(workflow_id, version DESC);

CREATE TABLE agent_effect_commit (
    effect_id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    tool_name TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL,
    arguments_json TEXT NOT NULL DEFAULT '{}',
    result_ref TEXT NOT NULL DEFAULT '',
    started_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    committed_at TEXT,
    FOREIGN KEY (workflow_id) REFERENCES agent_workflow(workflow_id) ON DELETE CASCADE,
    FOREIGN KEY (run_id) REFERENCES conversation_run(run_id) ON DELETE CASCADE
);

CREATE INDEX idx_agent_effect_workflow_node
    ON agent_effect_commit(workflow_id, node_id, updated_at DESC);

CREATE TABLE agent_write_lease (
    lease_id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    owner_label TEXT NOT NULL,
    scopes_json TEXT NOT NULL DEFAULT '[]',
    fencing_token INTEGER NOT NULL,
    state TEXT NOT NULL,
    expires_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (workflow_id) REFERENCES agent_workflow(workflow_id) ON DELETE CASCADE
);

CREATE INDEX idx_agent_write_lease_active
    ON agent_write_lease(workflow_id, state, expires_at);
