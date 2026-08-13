package com.lumora.core.conversation.application.port;

/**
 * Delivers a pending tool approval decision to the active agent run.
 */
public interface ToolApprovalPort {

    void decideToolApproval(String approvalId, String decision,
            String correlationId);
}
