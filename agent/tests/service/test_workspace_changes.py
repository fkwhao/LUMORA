import asyncio
import subprocess
from pathlib import Path

import pytest

from app.execution import workspace_changes
from app.execution.workspace_changes import WorkspaceChangeLedger
from app.tool.base import ToolContext, ToolInput, ToolResult, function_tool
from app.tool.registry import ToolRegistry, WorkspacePartialEffectError
from app.tool.resource_locks import (
    ResourceAccess,
    ResourceAccessMode,
    file_resource_key,
    workspace_resource_key,
)


def test_git_pure_rename_is_retained_with_blob_ownership(
    tmp_path: Path,
) -> None:
    _init_repository(tmp_path)
    source = tmp_path / "before.txt"
    source.write_text("same\n", encoding="utf-8")
    _git(tmp_path, "add", "before.txt")
    _git(tmp_path, "commit", "-m", "base")
    ledger = WorkspaceChangeLedger()
    access = (
        ResourceAccess(
            workspace_resource_key(tmp_path),
            ResourceAccessMode.WRITE,
        ),
    )

    before = ledger.capture(tmp_path, access)
    source.rename(tmp_path / "after.txt")
    after = ledger.capture(tmp_path, access)
    changes = ledger.compare(before, after)
    revision, events = ledger.record(
        workspace_path=tmp_path,
        repository_root=after.repository_root,
        task_id="task-a",
        run_id="run-a",
        agent_id="supervisor",
        changes=changes,
    )

    assert revision == 1
    assert len(events) == 1
    assert events[0].operation == "RENAMED"
    assert events[0].previous_path == "before.txt"
    assert events[0].path == "after.txt"
    assert events[0].before_blob == events[0].after_blob
    assert events[0].before_blob


def test_git_file_event_uses_worktree_root_relative_path(
    tmp_path: Path,
) -> None:
    _init_repository(tmp_path)
    subdirectory = tmp_path / "module"
    subdirectory.mkdir()
    target = subdirectory / "value.txt"
    target.write_text("before\n", encoding="utf-8")
    _git(tmp_path, "add", ".")
    _git(tmp_path, "commit", "-m", "base")
    ledger = WorkspaceChangeLedger()
    access = (
        ResourceAccess(file_resource_key(target), ResourceAccessMode.WRITE),
    )

    before = ledger.capture(subdirectory, access)
    target.write_text("after\n", encoding="utf-8")
    after = ledger.capture(subdirectory, access)
    changes = ledger.compare(before, after)

    assert changes[0]["path"] == "module/value.txt"
    assert changes[0]["beforeBlob"]
    assert changes[0]["afterBlob"]


def test_non_git_event_retains_bounded_before_and_after_content(
    tmp_path: Path,
) -> None:
    target = tmp_path / "value.txt"
    target.write_text("before\n", encoding="utf-8")
    ledger = WorkspaceChangeLedger()
    access = (
        ResourceAccess(file_resource_key(target), ResourceAccessMode.WRITE),
    )

    before = ledger.capture(tmp_path, access)
    target.write_text("after\n", encoding="utf-8")
    after = ledger.capture(tmp_path, access)
    changes = ledger.compare(before, after)
    _, events = ledger.record(
        workspace_path=tmp_path,
        repository_root=None,
        task_id="task-a",
        run_id="run-a",
        agent_id="supervisor",
        changes=changes,
    )

    assert events[0].before_content
    assert events[0].after_content
    assert events[0].before_blob == ""
    assert events[0].after_blob == ""


@pytest.mark.parametrize("cancelled", [False, True])
def test_failed_or_cancelled_tool_records_partial_effect(
    tmp_path: Path,
    cancelled: bool,
) -> None:
    target = tmp_path / "partial.txt"

    async def mutate_then_fail(
        _context: ToolContext,
        _input: ToolInput,
    ) -> ToolResult:
        target.write_text("partial\n", encoding="utf-8")
        if cancelled:
            raise asyncio.CancelledError
        raise ValueError("failed after write")

    registry = ToolRegistry((function_tool(
        name="partial_write",
        description="write then fail",
        input_schema={
            "type": "object",
            "properties": {},
            "additionalProperties": False,
        },
        execute=mutate_then_fail,
        resource_accesses=lambda _context, _input: (
            ResourceAccess(
                file_resource_key(target), ResourceAccessMode.WRITE
            ),
        ),
    ),))
    context = ToolContext(
        workspace_path=tmp_path,
        task_id="task-a",
        correlation_id="run-a",
    )

    with pytest.raises(WorkspacePartialEffectError) as captured:
        asyncio.run(registry.execute("partial_write", context, {}))

    metadata = captured.value.metadata
    assert metadata["failureKind"] == "partial_effect_review_required"
    assert metadata["toolExecutionState"] == "partial_effect"
    assert metadata["workspaceChanges"][0]["path"] == "partial.txt"
    assert metadata["workspaceChanges"][0]["operation"] == "ADDED"


def test_workspace_writer_replans_after_foreign_revision(
    tmp_path: Path,
) -> None:
    async def scenario() -> None:
        executed: list[str] = []

        async def write_workspace(
            context: ToolContext,
            _input: ToolInput,
        ) -> ToolResult:
            executed.append(context.correlation_id)
            (tmp_path / f"{context.correlation_id}.txt").write_text(
                context.correlation_id,
                encoding="utf-8",
            )
            return ToolResult("done")

        registry = ToolRegistry((function_tool(
            name="workspace_write",
            description="write workspace",
            input_schema={
                "type": "object",
                "properties": {},
                "additionalProperties": False,
            },
            execute=write_workspace,
            resource_accesses=lambda context, _input: (
                ResourceAccess(
                    workspace_resource_key(context.workspace_path),
                    ResourceAccessMode.WRITE,
                ),
            ),
        ),))
        context_a = ToolContext(
            workspace_path=tmp_path,
            task_id="task-a",
            correlation_id="run-a",
            workspace_revision=0,
        )
        context_b = ToolContext(
            workspace_path=tmp_path,
            task_id="task-b",
            correlation_id="run-b",
            workspace_revision=0,
        )
        registry.begin_workspace_run(context_a)
        registry.begin_workspace_run(context_b)

        first = await registry.execute("workspace_write", context_a, {})
        assert first.is_error is False
        stale = await registry.execute("workspace_write", context_b, {})
        assert stale.is_error is True
        assert stale.metadata["failureKind"] == "stale_workspace_version"
        assert stale.metadata["toolExecutionState"] == "not_started"
        assert executed == ["run-a"]
        assert not (tmp_path / "run-b.txt").exists()

    asyncio.run(scenario())


def test_large_file_set_is_explicitly_marked_incomplete(
    tmp_path: Path,
) -> None:
    async def write_many(
        _context: ToolContext,
        _input: ToolInput,
    ) -> ToolResult:
        for index in range(501):
            (tmp_path / f"generated-{index:03d}.txt").write_text(
                "generated\n",
                encoding="utf-8",
            )
        return ToolResult("done")

    registry = ToolRegistry((function_tool(
        name="write_many",
        description="write many files",
        input_schema={
            "type": "object",
            "properties": {},
            "additionalProperties": False,
        },
        execute=write_many,
        resource_accesses=lambda context, _input: (
            ResourceAccess(
                workspace_resource_key(context.workspace_path),
                ResourceAccessMode.WRITE,
            ),
        ),
    ),))
    result = asyncio.run(registry.execute(
        "write_many",
        ToolContext(
            workspace_path=tmp_path,
            task_id="task-many",
            correlation_id="run-many",
        ),
        {},
    ))

    assert result.metadata["workspaceChangeSetComplete"] is False
    assert result.metadata["workspaceChangeFilesTruncated"] is True
    assert len(result.metadata["workspaceChanges"]) == 500


def test_non_git_inventory_limit_is_explicitly_incomplete(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(workspace_changes, "MAX_INVENTORY_FILES", 2)
    (tmp_path / "baseline-a.txt").write_text("a", encoding="utf-8")
    (tmp_path / "baseline-b.txt").write_text("b", encoding="utf-8")

    async def write_beyond_inventory(
        _context: ToolContext,
        _input: ToolInput,
    ) -> ToolResult:
        (tmp_path / "unseen.txt").write_text("changed", encoding="utf-8")
        return ToolResult("done")

    registry = ToolRegistry((function_tool(
        name="bounded_inventory_write",
        description="write beyond bounded inventory",
        input_schema={
            "type": "object",
            "properties": {},
            "additionalProperties": False,
        },
        execute=write_beyond_inventory,
        resource_accesses=lambda context, _input: (
            ResourceAccess(
                workspace_resource_key(context.workspace_path),
                ResourceAccessMode.WRITE,
            ),
        ),
    ),))

    result = asyncio.run(registry.execute(
        "bounded_inventory_write",
        ToolContext(
            workspace_path=tmp_path,
            task_id="task-inventory",
            correlation_id="run-inventory",
        ),
        {},
    ))

    assert result.metadata["workspaceChangeSetComplete"] is False
    assert result.metadata["workspaceChangeFilesTruncated"] is True


def test_git_ignored_file_effect_is_captured(
    tmp_path: Path,
) -> None:
    _init_repository(tmp_path)
    (tmp_path / ".gitignore").write_text(".env\n", encoding="utf-8")
    _git(tmp_path, "add", ".gitignore")
    _git(tmp_path, "commit", "-m", "ignore env")

    async def create_ignored_file(
        _context: ToolContext,
        _input: ToolInput,
    ) -> ToolResult:
        (tmp_path / ".env").write_text("TOKEN=secret\n", encoding="utf-8")
        return ToolResult("done")

    registry = ToolRegistry((function_tool(
        name="write_ignored",
        description="write ignored file",
        input_schema={
            "type": "object",
            "properties": {},
            "additionalProperties": False,
        },
        execute=create_ignored_file,
        resource_accesses=lambda context, _input: (
            ResourceAccess(
                workspace_resource_key(context.workspace_path),
                ResourceAccessMode.WRITE,
            ),
        ),
    ),))

    result = asyncio.run(registry.execute(
        "write_ignored",
        ToolContext(
            workspace_path=tmp_path,
            task_id="task-ignored",
            correlation_id="run-ignored",
        ),
        {},
    ))

    assert result.metadata["workspaceChangeCount"] == 1
    assert result.metadata["workspaceChanges"][0]["path"] == ".env"
    assert result.metadata["workspaceChanges"][0]["operation"] == "ADDED"
    assert result.metadata["workspaceChangeSetComplete"] is False
    assert result.metadata["workspaceChanges"][0]["beforeBlob"] == ""
    assert result.metadata["workspaceChanges"][0]["afterBlob"] == ""
    assert result.metadata["workspaceChanges"][0]["patch"] == ""


def test_ignored_secret_is_not_written_to_git_object_database(
    tmp_path: Path,
) -> None:
    _init_repository(tmp_path)
    (tmp_path / ".gitignore").write_text(".env\n", encoding="utf-8")
    _git(tmp_path, "add", ".gitignore")
    _git(tmp_path, "commit", "-m", "ignore env")
    secret = tmp_path / ".env"
    secret.write_text("TOKEN=before-secret\n", encoding="utf-8")
    before_object = _hash_content(tmp_path, secret.read_bytes())
    assert not _git_object_exists(tmp_path, before_object)
    ledger = WorkspaceChangeLedger()
    access = (
        ResourceAccess(
            workspace_resource_key(tmp_path),
            ResourceAccessMode.WRITE,
        ),
    )

    before = ledger.capture(tmp_path, access)
    secret.write_text("TOKEN=after-secret\n", encoding="utf-8")
    after_object = _hash_content(tmp_path, secret.read_bytes())
    after = ledger.capture(tmp_path, access, before.private_paths)
    changes = ledger.compare(before, after)

    assert not _git_object_exists(tmp_path, before_object)
    assert not _git_object_exists(tmp_path, after_object)
    assert changes[0]["path"] == ".env"
    assert changes[0]["attributionComplete"] is False
    assert changes[0]["beforeBlob"] == ""
    assert changes[0]["afterBlob"] == ""


def test_ignore_rule_visibility_change_does_not_claim_existing_secret(
    tmp_path: Path,
) -> None:
    _init_repository(tmp_path)
    ignore_file = tmp_path / ".gitignore"
    ignore_file.write_text(".env\n", encoding="utf-8")
    _git(tmp_path, "add", ".gitignore")
    _git(tmp_path, "commit", "-m", "ignore env")
    secret = tmp_path / ".env"
    secret.write_text("TOKEN=unchanged\n", encoding="utf-8")
    secret_object = _hash_content(tmp_path, secret.read_bytes())
    ledger = WorkspaceChangeLedger()
    access = (
        ResourceAccess(
            workspace_resource_key(tmp_path),
            ResourceAccessMode.WRITE,
        ),
    )

    before = ledger.capture(tmp_path, access)
    ignore_file.write_text("", encoding="utf-8")
    after = ledger.capture(tmp_path, access, before.private_paths)
    changes = ledger.compare(before, after)

    assert [change["path"] for change in changes] == [".gitignore"]
    assert secret.read_text(encoding="utf-8") == "TOKEN=unchanged\n"
    assert not _git_object_exists(tmp_path, secret_object)


def test_new_ignore_rule_does_not_claim_or_delete_existing_file(
    tmp_path: Path,
) -> None:
    _init_repository(tmp_path)
    ignore_file = tmp_path / ".gitignore"
    ignore_file.write_text("", encoding="utf-8")
    _git(tmp_path, "add", ".gitignore")
    _git(tmp_path, "commit", "-m", "empty ignore")
    existing = tmp_path / "local.cache"
    existing.write_text("keep-me\n", encoding="utf-8")
    ledger = WorkspaceChangeLedger()
    access = (
        ResourceAccess(
            workspace_resource_key(tmp_path),
            ResourceAccessMode.WRITE,
        ),
    )

    before = ledger.capture(tmp_path, access)
    ignore_file.write_text("local.cache\n", encoding="utf-8")
    after = ledger.capture(tmp_path, access, before.private_paths)
    changes = ledger.compare(before, after)

    assert [change["path"] for change in changes] == [".gitignore"]
    assert existing.read_text(encoding="utf-8") == "keep-me\n"


def test_undeclared_mutating_tool_fails_closed_to_workspace_write(
    tmp_path: Path,
) -> None:
    target = tmp_path / "undeclared.txt"

    async def write_without_access_declaration(
        _context: ToolContext,
        _input: ToolInput,
    ) -> ToolResult:
        target.write_text("captured\n", encoding="utf-8")
        return ToolResult("done")

    registry = ToolRegistry((function_tool(
        name="undeclared_write",
        description="write without declared resources",
        input_schema={
            "type": "object",
            "properties": {},
            "additionalProperties": False,
        },
        execute=write_without_access_declaration,
        read_only=False,
    ),))
    result = asyncio.run(registry.execute(
        "undeclared_write",
        ToolContext(
            workspace_path=tmp_path,
            task_id="task-undeclared",
            correlation_id="run-undeclared",
        ),
        {},
    ))

    assert result.metadata["resourceAccess"][0]["mode"] == "write"
    assert result.metadata["resourceAccess"][0]["key"].startswith(
        "workspace:"
    )
    assert result.metadata["workspaceChangeCount"] == 1
    assert result.metadata["workspaceChanges"][0]["path"] == "undeclared.txt"


def _init_repository(root: Path) -> None:
    _git(root, "init")
    _git(root, "config", "user.name", "Lumora Test")
    _git(root, "config", "user.email", "lumora@example.invalid")


def _git(root: Path, *arguments: str) -> str:
    result = subprocess.run(
        ("git", "-C", str(root), *arguments),
        capture_output=True,
        check=False,
        text=True,
        encoding="utf-8",
    )
    if result.returncode != 0:
        raise AssertionError(result.stderr or result.stdout)
    return result.stdout


def _hash_content(root: Path, content: bytes) -> str:
    result = subprocess.run(
        ("git", "-C", str(root), "hash-object", "--stdin"),
        input=content,
        capture_output=True,
        check=True,
    )
    return result.stdout.decode("ascii").strip()


def _git_object_exists(root: Path, object_id: str) -> bool:
    result = subprocess.run(
        ("git", "-C", str(root), "cat-file", "-e", object_id),
        capture_output=True,
        check=False,
    )
    return result.returncode == 0
