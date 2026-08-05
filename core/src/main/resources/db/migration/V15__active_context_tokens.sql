ALTER TABLE conversation_message
    ADD COLUMN active_context_tokens INTEGER NOT NULL DEFAULT 0;
