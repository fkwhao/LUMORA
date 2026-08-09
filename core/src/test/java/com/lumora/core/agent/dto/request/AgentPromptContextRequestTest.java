package com.lumora.core.agent.dto.request;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

class AgentPromptContextRequestTest {

    @Test
    void exposesDynamicPlanToolForWorkspaceRuns() {
        AgentPromptContextRequest context =
                AgentPromptContextRequest.forWorkspace(
                        null,
                        "F:/project/LUMORA",
                        "request_approval"
                );

        assertTrue(context.getAvailableTools().contains("update_plan"));
    }
}
