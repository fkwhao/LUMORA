ALTER TABLE conversation_message
    ADD COLUMN work_log_json TEXT NOT NULL DEFAULT '[]';
