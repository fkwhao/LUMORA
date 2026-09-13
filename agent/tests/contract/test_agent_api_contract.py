from pathlib import Path
from typing import get_args

import pytest
import yaml

from app.config.settings import AgentSettings
from app.dto.request.chat_completion_request import (
    ExecutionBudgetRequest,
    ProjectInstructionInputRequest,
)
from app.dto.response.chat_stream_event_response import ChatStreamEventResponse
from app.harness.run_event import RunEventType
from app.main import create_app
from app.prompt.prompt_errors import PromptConfigurationError
from app.service.planner_service import PlannerService


def test_openapi_stream_event_enum_matches_runtime_dto() -> None:
    contract_path = Path(__file__).resolve().parents[3] / "contracts" / "agent-api.yaml"
    contract = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
    schemas = contract["components"]["schemas"]
    contract_types = set(schemas["ChatStreamEvent"]["properties"]["type"]["enum"])
    runtime_types = set(get_args(ChatStreamEventResponse.model_fields["type"].annotation))
    internal_types = set(get_args(RunEventType))
    event_properties = schemas["ChatStreamEvent"]["properties"]

    assert runtime_types == contract_types
    assert internal_types == contract_types
    assert event_properties["usage"]["$ref"].endswith("/TokenUsage")
    assert event_properties["activeContextTokens"]["minimum"] == 0


def test_prompt_context_contract_contains_only_runtime_facts() -> None:
    contract_path = Path(__file__).resolve().parents[3] / "contracts" / "agent-api.yaml"
    contract = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
    properties = contract["components"]["schemas"]["PromptContext"]["properties"]

    assert set(properties) == {
        "workspacePath",
        "projectInstructions",
        "projectInstructionInputs",
        "availableTools",
        "memorySummary",
        "memoryCandidates",
        "taskId",
        "conversationSummary",
        "permissionMode",
        "permissionRules",
        "mcpServers",
        "agentSessions",
        "workflowSnapshots",
        "executionBudget",
    }
    execution_budget = contract["components"]["schemas"]["ExecutionBudget"]
    assert set(execution_budget["properties"]) == {
        "maxModelRequests",
        "maxToolCalls",
        "maxWallTimeMs",
        "maxActiveAgents",
    }
    runtime_budget = ExecutionBudgetRequest.model_json_schema(by_alias=True)
    assert set(runtime_budget["properties"]) == set(
        execution_budget["properties"]
    )

    memory_schema = contract["components"]["schemas"]["MemoryContext"]
    assert memory_schema["properties"]["scope"]["enum"] == [
        "USER", "PROJECT", "CONVERSATION"
    ]
    project_input = contract["components"]["schemas"]["ProjectInstructionInput"]
    assert set(project_input["properties"]) == {
        "content", "sourceRef", "conflictKey", "scope"
    }
    assert project_input["allOf"] == [{
        "if": {"required": ["conflictKey"]},
        "then": {"required": ["sourceRef"]},
    }]
    assert project_input["properties"]["sourceRef"]["minLength"] == 1


def test_project_instruction_request_rejects_unsupported_scope_and_missing_ref() -> None:
    with pytest.raises(ValueError):
        ProjectInstructionInputRequest(
            content="项目规则",
            conflictKey="project.rule",
            sourceRef="AGENTS.md#rule",
            scope="workspace:/src",
        )
    with pytest.raises(ValueError, match="sourceRef"):
        ProjectInstructionInputRequest(
            content="项目规则",
            conflictKey="project.rule",
        )


def test_app_creation_fails_fast_on_invalid_core_prompt_configuration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class InvalidPromptBuilder:
        def validate_configuration(self) -> None:
            raise PromptConfigurationError("Core Prompt 配置无效")

    monkeypatch.setattr("app.main.PromptBuilder", InvalidPromptBuilder)

    with pytest.raises(PromptConfigurationError, match="Core Prompt"):
        create_app(
            AgentSettings(
                host="127.0.0.1",
                port=45101,
                startup_token="a" * 64,
                protocol_version="1",
            ),
            PlannerService(),
        )


def test_memory_extraction_contract_supports_lifecycle_and_project_rules() -> None:
    contract_path = Path(__file__).resolve().parents[3] / "contracts" / "agent-api.yaml"
    contract = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
    schemas = contract["components"]["schemas"]

    assert "workspacePath" in schemas["MemoryExtractionRequest"]["properties"]
    candidate = schemas["MemoryCandidate"]
    assert candidate["properties"]["action"]["enum"] == ["UPSERT", "ARCHIVE"]
    assert candidate["properties"]["storage"]["enum"] == [
        "MEMORY", "PROJECT_INSTRUCTIONS"
    ]


def test_http_route_split_preserves_public_paths_and_methods() -> None:
    app = create_app(
        AgentSettings(
            host="127.0.0.1",
            port=45101,
            startup_token="a" * 64,
            protocol_version="1",
        ),
        PlannerService(),
    )
    paths = app.openapi()["paths"]

    assert {path: set(operations) for path, operations in paths.items()} == {
        "/api/v1/health": {"get"},
        "/api/v1/tasks/plan": {"post"},
        "/api/v1/chat/completions": {"post"},
        "/api/v1/chat/completions/stream": {"post"},
            "/api/v1/chat/compact": {"post"},
            "/api/v1/chat/runs/{run_id}/pause": {"post"},
            "/api/v1/chat/runs/{run_id}/steers/{input_id}": {
                "post", "put", "delete"
            },
        "/api/v1/artifacts/read": {"post"},
        "/api/v1/artifacts/search": {"post"},
        "/api/v1/models": {"post"},
        "/api/v1/memory/extractions": {"post"},
        "/api/v1/tool-approvals/{approval_id}": {"post"},
        "/api/v1/mcp/test": {"post"},
    }
