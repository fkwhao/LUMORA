ALTER TABLE conversation_message
ADD COLUMN parent_message_id TEXT;

ALTER TABLE conversation_message
ADD COLUMN message_depth INTEGER NOT NULL DEFAULT 0;

ALTER TABLE conversation_message
ADD COLUMN active_path INTEGER NOT NULL DEFAULT 1;

UPDATE conversation_message
SET message_depth = sequence;

UPDATE conversation_message AS current
SET parent_message_id = (
    SELECT previous.message_id
    FROM conversation_message AS previous
    WHERE previous.conversation_id = current.conversation_id
      AND previous.sequence = current.sequence - 1
);

CREATE INDEX idx_conversation_message_parent
    ON conversation_message(conversation_id, parent_message_id);

CREATE INDEX idx_conversation_message_active_path
    ON conversation_message(conversation_id, active_path, message_depth);
