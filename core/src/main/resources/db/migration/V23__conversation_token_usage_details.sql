ALTER TABLE conversation_message
ADD COLUMN input_tokens INTEGER NOT NULL DEFAULT 0;

ALTER TABLE conversation_message
ADD COLUMN output_tokens INTEGER NOT NULL DEFAULT 0;

ALTER TABLE conversation_message
ADD COLUMN reasoning_tokens INTEGER NOT NULL DEFAULT 0;

ALTER TABLE conversation_message
ADD COLUMN cache_read_tokens INTEGER NOT NULL DEFAULT 0;

ALTER TABLE conversation_message
ADD COLUMN cache_write_tokens INTEGER NOT NULL DEFAULT 0;

ALTER TABLE conversation_message
ADD COLUMN cache_metrics_available INTEGER NOT NULL DEFAULT 0;

UPDATE conversation_message
SET input_tokens = prompt_tokens,
    output_tokens = completion_tokens;

CREATE INDEX idx_conversation_message_usage_created
    ON conversation_message(role, created_at);
