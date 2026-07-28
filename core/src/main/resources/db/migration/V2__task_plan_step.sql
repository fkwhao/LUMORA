CREATE TABLE IF NOT EXISTS task_plan_step (
    task_id TEXT NOT NULL,
    step_index INTEGER NOT NULL,
    step_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    requires_approval INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (task_id, step_index),
    UNIQUE (task_id, step_id),
    FOREIGN KEY (task_id) REFERENCES agent_task(task_id)
);

CREATE INDEX IF NOT EXISTS idx_task_plan_step_task
    ON task_plan_step(task_id, step_index);
