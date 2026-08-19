import asyncio
from pathlib import Path

import pytest

from app.execution.write_intents import (
    WriteIntentManager,
    WriterConflict,
    declared_write_scopes,
)
from app.tool.base import ToolContext
from app.tool.default_registry import create_default_tool_registry


def test_recursive_declared_scope_blocks_another_writer(tmp_path: Path) -> None:
    manager = WriteIntentManager()
    source_scope = declared_write_scopes(tmp_path, ("src/**",))
    file_scope = declared_write_scopes(tmp_path, ("src/module.py",))
    claim = manager.acquire("agent-a", source_scope, owner_label="实现模块")

    with pytest.raises(WriterConflict) as captured:
        manager.acquire("agent-b", file_scope, owner_label="修改模块")

    metadata = captured.value.metadata()
    assert metadata["failureKind"] == "writer_conflict"
    assert metadata["toolExecutionState"] == "not_started"
    assert metadata["conflictingWriters"][0]["ownerId"] == "agent-a"
    manager.release(claim)
    assert manager.acquire("agent-b", file_scope) is not None


def test_exact_scope_captures_content_baseline(tmp_path: Path) -> None:
    target = tmp_path / "module.py"
    target.write_text("value = 1\n", encoding="utf-8")

    scope = declared_write_scopes(tmp_path, (target.name,))[0]

    assert scope.baseline_hash.startswith("sha256:")


def test_registry_dynamic_write_respects_agent_write_intent(tmp_path: Path) -> None:
    registry = create_default_tool_registry()
    manager = registry.write_intents
    declared = declared_write_scopes(tmp_path, ("src/**",))
    claim = manager.acquire("child-session", declared, owner_label="子 Agent")
    root_context = ToolContext(
        workspace_path=tmp_path.resolve(),
        task_id="task",
        session_id="root-session",
        agent_id="supervisor",
    )

    with pytest.raises(WriterConflict):
        asyncio.run(
            registry.execute(
                "write_file",
                root_context,
                {"path": "src/new.py", "content": "value = 1\n"},
            )
        )

    manager.release(claim)
    result = asyncio.run(
        registry.execute(
            "write_file",
            root_context,
            {"path": "src/new.py", "content": "value = 1\n"},
        )
    )
    assert result.metadata["created"] is True


def test_declared_scope_rejects_workspace_escape(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="不能超出"):
        declared_write_scopes(tmp_path, ("../outside/**",))
