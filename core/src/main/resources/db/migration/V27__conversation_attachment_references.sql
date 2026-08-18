ALTER TABLE conversation_message
    ADD COLUMN attachments_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE conversation_run
    ADD COLUMN attachments_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE conversation_input
    ADD COLUMN attachments_json TEXT NOT NULL DEFAULT '[]';
