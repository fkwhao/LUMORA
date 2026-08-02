-- MyBatis-Plus 的通用 ById 方法要求实体具备单字段主键。
-- SQLite 不支持直接替换联合主键，因此通过重建表完成兼容迁移。
CREATE TABLE task_plan_step_new (
    plan_step_id TEXT NOT NULL PRIMARY KEY,
    task_id TEXT NOT NULL,
    step_index INTEGER NOT NULL,
    step_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    requires_approval INTEGER NOT NULL DEFAULT 0,
    UNIQUE (task_id, step_index),
    UNIQUE (task_id, step_id),
    FOREIGN KEY (task_id) REFERENCES agent_task(task_id)
);

INSERT INTO task_plan_step_new (
    plan_step_id,
    task_id,
    step_index,
    step_id,
    title,
    description,
    requires_approval
)
SELECT
    lower(hex(randomblob(16))),
    task_id,
    step_index,
    step_id,
    title,
    description,
    requires_approval
FROM task_plan_step;

DROP TABLE task_plan_step;

ALTER TABLE task_plan_step_new RENAME TO task_plan_step;

CREATE INDEX idx_task_plan_step_task
    ON task_plan_step(task_id, step_index);
