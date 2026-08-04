from pathlib import Path
from typing import get_args

import yaml

from app.dto.response.chat_stream_event_response import ChatStreamEventResponse


def test_openapi_stream_event_enum_matches_runtime_dto() -> None:
    contract_path = Path(__file__).resolve().parents[3] / "contracts" / "agent-api.yaml"
    contract = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
    schemas = contract["components"]["schemas"]
    contract_types = set(schemas["ChatStreamEvent"]["properties"]["type"]["enum"])
    runtime_types = set(get_args(ChatStreamEventResponse.model_fields["type"].annotation))

    assert runtime_types == contract_types


def test_prompt_context_contract_contains_only_runtime_facts() -> None:
    contract_path = Path(__file__).resolve().parents[3] / "contracts" / "agent-api.yaml"
    contract = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
    properties = contract["components"]["schemas"]["PromptContext"]["properties"]

    assert set(properties) == {
        "workspacePath",
        "projectInstructions",
        "availableTools",
        "memorySummary",
        "permissionMode",
        "permissionRules",
    }
