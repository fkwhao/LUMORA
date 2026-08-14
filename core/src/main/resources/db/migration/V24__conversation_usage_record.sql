ALTER TABLE conversation_message
    ADD COLUMN usage_record_only INTEGER NOT NULL DEFAULT 0;
