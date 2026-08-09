import asyncio
import json
from pathlib import Path

import pytest

from app.tool.base import ToolContext
from app.tool.default_registry import create_default_tool_registry
from app.tool.planning_tools import planning_tools
from app.tool.registry import ToolInputError, ToolRegistry


def test_update_plan_returns_progress_summary() -> None:
    registry = ToolRegistry(planning_tools())

    result = asyncio.run(registry.execute(
        "update_plan",
        ToolContext(workspace_path=Path.cwd()),
        {
            "steps": [
                {"step": "检查现有实现", "status": "completed"},
                {"step": "接入动态计划", "status": "in_progress"},
                {"step": "运行测试", "status": "pending"},
            ]
        },
    ))

    assert json.loads(result.content) == {
        "updated": True,
        "completed": 1,
        "total": 3,
    }
    assert result.metadata["readOnly"] is True
    assert result.metadata["planStepCount"] == 3


def test_default_registry_exposes_update_plan_to_the_model() -> None:
    registry = create_default_tool_registry()

    assert "update_plan" in registry.names()
    definition = next(
        item for item in registry.model_definitions()
        if item["function"]["name"] == "update_plan"
    )
    assert definition["function"]["parameters"]["required"] == ["steps"]


def test_update_plan_rejects_multiple_active_steps() -> None:
    registry = ToolRegistry(planning_tools())

    with pytest.raises(ToolInputError, match="只能有一个"):
        asyncio.run(registry.execute(
            "update_plan",
            ToolContext(workspace_path=Path.cwd()),
            {
                "steps": [
                    {"step": "第一步", "status": "in_progress"},
                    {"step": "第二步", "status": "in_progress"},
                ]
            },
        ))
