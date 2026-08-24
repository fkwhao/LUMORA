package com.lumora.core.agent.dto.request;

import com.lumora.core.conversation.domain.model.AgentSessionSnapshot;

import java.util.List;

public class AgentSessionSnapshotRequest {
    private final String agentId;
    private final String sessionId;
    private final String parentAgentId;
    private final String parentSessionId;
    private final String teamId;
    private final String activeActivationId;
    private final String label;
    private final String status;
    private final String mode;
    private final int delegationDepth;
    private final String model;
    private final int unreadReportCount;
    private final String latestReport;
    private final List<AgentInboxMessageRequest> inbox;
    private final AgentCheckpointRequest checkpoint;

    public AgentSessionSnapshotRequest(AgentSessionSnapshot snapshot) {
        this.agentId = snapshot.agentId();
        this.sessionId = snapshot.sessionId();
        this.parentAgentId = snapshot.parentAgentId();
        this.parentSessionId = snapshot.parentSessionId();
        this.teamId = snapshot.teamId();
        this.activeActivationId = snapshot.activeActivationId();
        this.label = snapshot.label();
        this.status = snapshot.status();
        this.mode = snapshot.mode();
        this.delegationDepth = snapshot.delegationDepth();
        this.model = snapshot.model();
        this.unreadReportCount = snapshot.unreadReportCount();
        this.latestReport = snapshot.latestReport();
        this.inbox = snapshot.inbox().stream()
                .map(AgentInboxMessageRequest::new)
                .toList();
        this.checkpoint = snapshot.checkpoint() == null ? null
                : new AgentCheckpointRequest(snapshot.checkpoint());
    }

    public String getAgentId() { return agentId; }
    public String getSessionId() { return sessionId; }
    public String getParentAgentId() { return parentAgentId; }
    public String getParentSessionId() { return parentSessionId; }
    public String getTeamId() { return teamId; }
    public String getActiveActivationId() { return activeActivationId; }
    public String getLabel() { return label; }
    public String getStatus() { return status; }
    public String getMode() { return mode; }
    public int getDelegationDepth() { return delegationDepth; }
    public String getModel() { return model; }
    public int getUnreadReportCount() { return unreadReportCount; }
    public String getLatestReport() { return latestReport; }
    public List<AgentInboxMessageRequest> getInbox() { return inbox; }
    public AgentCheckpointRequest getCheckpoint() { return checkpoint; }
}
