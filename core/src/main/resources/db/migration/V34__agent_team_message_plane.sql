ALTER TABLE agent_session
    ADD COLUMN team_id TEXT NOT NULL DEFAULT '';

UPDATE agent_session
SET team_id = task_id
WHERE team_id = '';

CREATE INDEX idx_agent_session_team_depth
    ON agent_session(team_id, delegation_depth, created_at);

ALTER TABLE agent_inbox_message
    ADD COLUMN message_kind TEXT NOT NULL DEFAULT 'task';

ALTER TABLE agent_inbox_message
    ADD COLUMN sender_label TEXT NOT NULL DEFAULT '';
