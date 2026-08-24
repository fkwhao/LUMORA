package com.lumora.core.conversation.domain.model;

import java.util.List;

public record AgentSessionSnapshot(
        String agentId,
        String sessionId,
        String parentAgentId,
        String parentSessionId,
        String teamId,
        String activeActivationId,
        String label,
        String status,
        String mode,
        int delegationDepth,
        String model,
        int unreadReportCount,
        String latestReport,
        List<AgentInboxSnapshot> inbox,
        AgentCheckpointSnapshot checkpoint
) {
    public AgentSessionSnapshot {
        inbox = inbox == null ? List.of() : List.copyOf(inbox);
    }
}
