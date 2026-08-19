package com.lumora.core.agent.dto.request;

import com.lumora.core.conversation.domain.model.AgentCheckpointSnapshot;

import java.util.List;
import java.util.Map;

public class AgentCheckpointRequest {
    private final long sequence;
    private final long consumedInboxSequence;
    private final List<Map<String, Object>> transcript;
    private final String summary;

    public AgentCheckpointRequest(AgentCheckpointSnapshot snapshot) {
        this.sequence = snapshot.sequence();
        this.consumedInboxSequence = snapshot.consumedInboxSequence();
        this.transcript = snapshot.transcript();
        this.summary = snapshot.summary();
    }

    public long getSequence() { return sequence; }
    public long getConsumedInboxSequence() { return consumedInboxSequence; }
    public List<Map<String, Object>> getTranscript() { return transcript; }
    public String getSummary() { return summary; }
}
