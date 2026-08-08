ALTER TABLE agent_task
    ADD COLUMN selected_model TEXT NOT NULL DEFAULT '';

ALTER TABLE agent_task
    ADD COLUMN selected_reasoning_effort TEXT NOT NULL DEFAULT '';
