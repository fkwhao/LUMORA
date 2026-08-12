package com.lumora.core.agent.dto.request;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

class AgentPromptContextRequestTest {

    @Test
    void delegatesWorkspaceDefaultToolsToPythonRegistry() {
        AgentPromptContextRequest context =
                AgentPromptContextRequest.forWorkspace(
                        null,
                        "F:/project/LUMORA",
                        "request_approval"
                );

        assertTrue(context.getAvailableTools().isEmpty());
    }
}
