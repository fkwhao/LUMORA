ALTER TABLE agent_task
    ADD COLUMN workspace_path TEXT NOT NULL DEFAULT '';

UPDATE agent_task
SET workspace_path = COALESCE((
    SELECT conversation_run.workspace_path
    FROM conversation_run
    WHERE conversation_run.task_id = agent_task.task_id
      AND TRIM(COALESCE(conversation_run.workspace_path, '')) <> ''
    ORDER BY conversation_run.created_at DESC
    LIMIT 1
), '')
WHERE workspace_path = '';
