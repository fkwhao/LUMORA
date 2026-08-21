import asyncio
from pathlib import Path

import pytest
from app.execution.merge import merge_text
from app.execution.write_intents import (
    FileWriteLeaseStore,
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


def test_cross_process_lease_uses_fifo_waiters_and_fencing_tokens(
    tmp_path: Path,
) -> None:
    registry_path = tmp_path / "leases.json"
    first = WriteIntentManager(FileWriteLeaseStore(registry_path))
    second = WriteIntentManager(FileWriteLeaseStore(registry_path))
    third = WriteIntentManager(FileWriteLeaseStore(registry_path))
    scope = declared_write_scopes(tmp_path, ("src/**",))

    first_claim = first.acquire("first", scope)
    assert first_claim is not None
    with pytest.raises(WriterConflict) as second_waiting:
        second.acquire("second", scope)
    with pytest.raises(WriterConflict) as third_waiting:
        third.acquire("third", scope)
    assert second_waiting.value.metadata()["queuePosition"] == 1
    assert third_waiting.value.metadata()["queuePosition"] == 2

    first.release(first_claim)
    with pytest.raises(WriterConflict) as still_waiting:
        third.acquire("third", scope)
    assert still_waiting.value.conflicts[0].owner_id == "second"

    second_claim = second.acquire("second", scope)
    assert second_claim is not None
    assert second_claim.fencing_token > first_claim.fencing_token
    second.release(second_claim)
    third_claim = third.acquire("third", scope)
    assert third_claim is not None
    assert third_claim.fencing_token > second_claim.fencing_token
    third.release(third_claim)


def test_stale_fencing_token_is_rejected_before_write(tmp_path: Path) -> None:
    registry_path = tmp_path / "leases.json"
    first = WriteIntentManager(FileWriteLeaseStore(registry_path))
    second = WriteIntentManager(FileWriteLeaseStore(registry_path))
    scope = declared_write_scopes(tmp_path, ("src/**",))

    stale_claim = first.acquire("attempt-1", scope)
    assert stale_claim is not None
    # Simulate expiry/cleanup from another process while the old worker still
    # has its process-local claim.
    FileWriteLeaseStore(registry_path).release(stale_claim)
    current_claim = second.acquire("attempt-2", scope)
    assert current_claim is not None

    with pytest.raises(OSError, match="租约"):
        first.ensure_current("attempt-1", scope)

    first.release(stale_claim)
    second.release(current_claim)


def test_three_way_merge_combines_independent_changes() -> None:
    result = merge_text(
        "left = 1\nright = 1\n",
        "left = 2\nright = 1\n",
        "left = 1\nright = 2\n",
    )

    assert result.merged is True
    assert result.content == "left = 2\nright = 2\n"


def test_three_way_merge_ignores_windows_line_ending_differences() -> None:
    result = merge_text(
        "left = 1\r\nright = 1\r\n",
        "left = 2\nright = 1\n",
        "left = 1\nright = 2\n",
    )

    assert result.merged is True
    assert result.content == "left = 2\nright = 2\n"


def test_write_file_auto_merges_independent_sibling_agent_change(
    tmp_path: Path,
) -> None:
    registry = create_default_tool_registry()
    supervisor = ToolContext(
        workspace_path=tmp_path.resolve(),
        task_id="merge-task",
        session_id="supervisor-run",
        agent_id="supervisor",
    )
    child = ToolContext(
        workspace_path=tmp_path.resolve(),
        task_id="merge-task",
        session_id="child-session",
        agent_id="child",
    )
    target = tmp_path / "values.txt"
    target.write_text("left = 1\nright = 1\n", encoding="utf-8")

    supervisor_read = asyncio.run(registry.execute(
        "read_file", supervisor, {"path": target.name}
    ))
    asyncio.run(registry.execute(
        "read_file", child, {"path": target.name}
    ))
    asyncio.run(registry.execute(
        "write_file",
        child,
        {
            "path": target.name,
            "content": "left = 2\nright = 1\n",
        },
    ))
    merged = asyncio.run(registry.execute(
        "write_file",
        supervisor,
        {
            "path": target.name,
            "content": "left = 1\nright = 2\n",
            "conflictPolicy": "merge",
            "baseObservationId": supervisor_read.metadata["observationId"],
        },
    ))

    assert merged.is_error is False
    assert merged.metadata["writeResolution"] == "auto_merged"
    assert merged.metadata["mergeApplied"] is True
    assert merged.metadata["baseObservationId"] == (
        supervisor_read.metadata["observationId"]
    )
    assert merged.metadata["observationId"]
    assert target.read_text(encoding="utf-8") == (
        "left = 2\nright = 2\n"
    )


def test_explicit_observation_can_select_an_older_retained_baseline(
    tmp_path: Path,
) -> None:
    registry = create_default_tool_registry()
    supervisor = ToolContext(
        workspace_path=tmp_path.resolve(),
        session_id="supervisor",
    )
    child = ToolContext(
        workspace_path=tmp_path.resolve(),
        session_id="child",
    )
    target = tmp_path / "retained.txt"
    target.write_text("left = 1\nright = 1\n", encoding="utf-8")
    original = asyncio.run(registry.execute(
        "read_file", supervisor, {"path": target.name}
    ))
    asyncio.run(registry.execute(
        "read_file", child, {"path": target.name}
    ))
    asyncio.run(registry.execute(
        "write_file",
        child,
        {
            "path": target.name,
            "content": "left = 2\nright = 1\n",
        },
    ))
    latest = asyncio.run(registry.execute(
        "read_file", supervisor, {"path": target.name}
    ))

    assert latest.metadata["observationId"] != (
        original.metadata["observationId"]
    )
    merged = asyncio.run(registry.execute(
        "write_file",
        supervisor,
        {
            "path": target.name,
            "content": "left = 1\nright = 2\n",
            "conflictPolicy": "merge",
            "baseObservationId": original.metadata["observationId"],
        },
    ))
    assert merged.metadata["writeResolution"] == "auto_merged"
    assert target.read_text(encoding="utf-8") == (
        "left = 2\nright = 2\n"
    )


def test_write_file_rejects_an_unknown_explicit_observation(
    tmp_path: Path,
) -> None:
    registry = create_default_tool_registry()
    context = ToolContext(
        workspace_path=tmp_path.resolve(),
        session_id="supervisor",
    )
    target = tmp_path / "unknown-observation.txt"
    target.write_text("value = 1\n", encoding="utf-8")

    result = asyncio.run(registry.execute(
        "write_file",
        context,
        {
            "path": target.name,
            "content": "value = 2\n",
            "conflictPolicy": "merge",
            "baseObservationId": "obs_missing",
        },
    ))

    assert result.is_error is True
    assert result.metadata["failureKind"] == "human_merge_required"
    assert result.metadata["writeResolution"] == "baseline_unavailable"
    assert result.metadata["baseHash"] is None
    assert target.read_text(encoding="utf-8") == "value = 1\n"


def test_write_file_returns_human_resolution_for_overlapping_merge(
    tmp_path: Path,
) -> None:
    registry = create_default_tool_registry()
    context = ToolContext(
        workspace_path=tmp_path.resolve(),
        task_id="task-merge",
        session_id="writer",
    )
    target = tmp_path / "values.txt"
    target.write_text("value = 1\n", encoding="utf-8")
    asyncio.run(registry.execute("read_file", context, {"path": target.name}))
    target.write_text("value = 2\n", encoding="utf-8")

    result = asyncio.run(registry.execute(
        "write_file",
        context,
        {
            "path": target.name,
            "content": "value = 3\n",
            "conflictPolicy": "merge",
        },
    ))

    assert result.is_error is True
    assert result.metadata["failureKind"] == "human_merge_required"
    assert result.metadata["writeResolution"] == "manual_merge_required"
    assert result.metadata["baseHash"]
    assert result.metadata["conflictHunks"]
    assert target.read_text(encoding="utf-8") == "value = 2\n"
