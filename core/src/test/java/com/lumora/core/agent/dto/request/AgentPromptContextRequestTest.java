package com.lumora.core.agent.dto.request;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
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
        assertEquals(
                10,
                context.getExecutionBudget().getMaxActiveAgents()
        );
    }

    @Test
    void carriesStructuredProjectInstructionProvenanceWithoutAuthorityFields() {
        AgentPromptInstructionInputRequest input =
                new AgentPromptInstructionInputRequest(
                        "项目使用 unittest",
                        "project-policy",
                        "lumora.collaboration",
                        "workspace"
                );
        AgentPromptContextRequest context = AgentPromptContextRequest.forWorkspace(
                null,
                "F:/project/LUMORA",
                "request_approval",
                "task-1",
                null,
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(input)
        );

        assertEquals(List.of(input), context.getProjectInstructionInputs());
        assertEquals("lumora.collaboration", input.getConflictKey());
    }

    @Test
    void rejectsDirectoryPromptScope() {
        assertThrows(
                IllegalArgumentException.class,
                () -> new AgentPromptInstructionInputRequest(
                        "项目规则",
                        "AGENTS.md#rule",
                        "project.rule",
                        "workspace:/src"
                )
        );
    }

    @Test
    void requiresSourceReferenceForStructuredConflictRule() {
        assertThrows(
                IllegalArgumentException.class,
                () -> new AgentPromptInstructionInputRequest(
                        "项目规则",
                        null,
                        "project.rule",
                        "workspace"
                )
        );
    }
}
