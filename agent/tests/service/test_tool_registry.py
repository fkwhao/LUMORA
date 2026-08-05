import asyncio
from pathlib import Path

import pytest
from app.tool import (
    ToolCategory,
    ToolContext,
    ToolInputError,
    ToolRegistry,
    ToolResult,
    function_tool,
)


def sample_tool():
    return function_tool(
        name="echo",
        description="返回输入内容",
        input_schema={
            "type": "object",
            "properties": {"text": {"type": "string"}},
            "required": ["text"],
            "additionalProperties": False,
        },
        category=ToolCategory.OTHER,
        read_only=True,
        concurrency_safe=True,
        execute=lambda _context, data: ToolResult(content=str(data["text"])),
        title=lambda data: f"Echo {data['text']}",
    )


def test_registry_is_the_source_of_model_definitions() -> None:
    registry = ToolRegistry((sample_tool(),))

    definitions = registry.model_definitions()

    assert registry.names() == ("echo",)
    assert definitions[0]["function"]["name"] == "echo"
    assert definitions[0]["function"]["parameters"]["required"] == ["text"]


def test_registry_rejects_duplicate_names_and_invalid_input() -> None:
    registry = ToolRegistry((sample_tool(),))
    with pytest.raises(ValueError, match="重复"):
        registry.register(sample_tool())

    context = ToolContext(workspace_path=Path.cwd())
    with pytest.raises(ToolInputError, match="缺少必填参数"):
        asyncio.run(registry.execute("echo", context, {}))


def test_registry_adds_policy_and_duration_metadata() -> None:
    registry = ToolRegistry((sample_tool(),))
    context = ToolContext(workspace_path=Path.cwd())

    result = asyncio.run(
        registry.execute("echo", context, {"text": "hello"})
    )

    assert result.content == "hello"
    assert result.metadata["readOnly"] is True
    assert result.metadata["destructive"] is False
    assert result.metadata["category"] == "other"
    assert result.metadata["title"] == "Echo hello"
    assert int(result.metadata["durationMs"]) >= 1
