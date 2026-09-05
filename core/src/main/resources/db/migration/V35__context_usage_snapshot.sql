ALTER TABLE conversation_message
    ADD COLUMN active_context_estimated INTEGER NOT NULL DEFAULT 1;
