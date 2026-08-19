import asyncio
import os
from pathlib import Path

import pytest

from app.tool.base import ToolContext
from app.tool.default_registry import create_default_tool_registry
from app.tool.filesystem_tools import _atomic_write_text, _file_version
from app.tool.tool_runtime import (
    create_default_tool_registry as create_compatible_registry,
)


def test_file_tools_are_confined_to_workspace(tmp_path: Path) -> None:
    registry = create_default_tool_registry()
    context = ToolContext(workspace_path=tmp_path.resolve())

    written = asyncio.run(
        registry.execute(
            "write_file",
            context,
            {"path": "src/example.txt", "content": "first\nsecond"},
        )
    )
    read = asyncio.run(
        registry.execute(
            "read_file",
            context,
            {"path": "src/example.txt", "startLine": 2},
        )
    )

    assert written.metadata["created"] is True
    assert read.content == "2: second"
    with pytest.raises(ValueError, match="超出当前工作区"):
        asyncio.run(
            registry.execute(
                "read_file",
                context,
                {"path": "../secret.txt"},
            )
        )


def test_shell_validation_does_not_embed_permission_blacklist(tmp_path: Path) -> None:
    registry = create_default_tool_registry()
    tool, normalized = registry.validate(
        "shell_command",
        {"command": "Remove-Item -Recurse build"},
    )

    assert normalized["command"] == "Remove-Item -Recurse build"
    assert tool.is_destructive(normalized) is True


def test_read_file_is_chunked_and_exposes_next_start_line(tmp_path: Path) -> None:
    registry = create_default_tool_registry()
    context = ToolContext(workspace_path=tmp_path.resolve())
    source = "\n".join(f"line-{number}" for number in range(1, 451))
    (tmp_path / "large.txt").write_text(source, encoding="utf-8")

    first = asyncio.run(
        registry.execute("read_file", context, {"path": "large.txt"})
    )
    second = asyncio.run(
        registry.execute(
            "read_file",
            context,
            {"path": "large.txt", "startLine": first.metadata["nextStartLine"]},
        )
    )

    assert first.metadata["lineCount"] == 200
    assert first.metadata["totalLineCount"] == 450
    assert first.metadata["nextStartLine"] == 201
    assert first.metadata["hasMore"] is True
    assert first.metadata["truncated"] is True
    assert "200: line-200" in first.content
    assert "201: line-201" in second.content


def test_search_in_file_returns_bounded_matching_lines(tmp_path: Path) -> None:
    registry = create_default_tool_registry()
    context = ToolContext(workspace_path=tmp_path.resolve())
    (tmp_path / "source.ts").write_text(
        "alpha\nneedle one\nbeta\nNeedle two\nneedle three",
        encoding="utf-8",
    )

    result = asyncio.run(
        registry.execute(
            "search_in_file",
            context,
            {"path": "source.ts", "query": "needle", "maxResults": 2},
        )
    )

    assert result.content.startswith("2: needle one\n4: Needle two")
    assert result.metadata["matchCount"] == 3
    assert result.metadata["resultCount"] == 2
    assert result.metadata["truncated"] is True


def test_apply_patch_requires_unique_match_and_writes_atomically(
    tmp_path: Path,
) -> None:
    registry = create_default_tool_registry()
    context = ToolContext(workspace_path=tmp_path.resolve())
    target = tmp_path / "source.ts"
    with target.open("w", encoding="utf-8", newline="") as file:
        file.write("const first = 1;\r\nconst second = 1;")

    with pytest.raises(ValueError, match="匹配到 2 处"):
        asyncio.run(
            registry.execute(
                "apply_patch",
                context,
                {"path": "source.ts", "oldText": " = 1;", "newText": " = 2;"},
            )
        )

    result = asyncio.run(
        registry.execute(
            "apply_patch",
            context,
            {
                "path": "source.ts",
                "oldText": "const second = 1;",
                "newText": "const second = 2;",
            },
        )
    )

    assert target.read_text(encoding="utf-8").endswith("const second = 2;")
    with target.open("r", encoding="utf-8", newline="") as file:
        assert "\r\n" in file.read()
    assert result.metadata["replacements"] == 1
    assert not tuple(tmp_path.glob(".source.ts.*.lumora-tmp"))


def test_atomic_create_rejects_a_target_that_was_created_first(
    tmp_path: Path,
) -> None:
    target = tmp_path / "created-by-another-runtime.txt"
    target.write_text("external", encoding="utf-8")

    with pytest.raises(ValueError, match="已被其他任务创建"):
        _atomic_write_text(target, "local", expected_version=None)

    assert target.read_text(encoding="utf-8") == "external"
    assert not tuple(tmp_path.glob(".*.lumora-tmp"))


def test_atomic_replace_rechecks_the_observed_version_before_publish(
    tmp_path: Path,
) -> None:
    target = tmp_path / "changed-externally.txt"
    target.write_text("observed", encoding="utf-8")
    observed_version = _file_version(target)
    target.write_text("external update is a different size", encoding="utf-8")

    with pytest.raises(ValueError, match="提交写入前发生变化"):
        _atomic_write_text(
            target,
            "stale local update",
            expected_version=observed_version,
        )

    assert target.read_text(encoding="utf-8") == "external update is a different size"
    assert not tuple(tmp_path.glob(".*.lumora-tmp"))


def test_file_resource_identity_follows_existing_symbolic_links(
    tmp_path: Path,
) -> None:
    target = tmp_path / "target.txt"
    alias = tmp_path / "alias.txt"
    target.write_text("shared", encoding="utf-8")
    try:
        os.symlink(target, alias)
    except (NotImplementedError, OSError) as error:
        pytest.skip(f"当前环境不允许创建符号链接：{error}")

    registry = create_default_tool_registry()
    context = ToolContext(workspace_path=tmp_path.resolve(), task_id="task-link")
    direct = asyncio.run(
        registry.execute("read_file", context, {"path": "target.txt"})
    )
    linked = asyncio.run(
        registry.execute("read_file", context, {"path": "alias.txt"})
    )

    direct_file_keys = tuple(
        item["key"]
        for item in direct.metadata["resourceAccess"]
        if item["key"].startswith("file:")
    )
    linked_file_keys = tuple(
        item["key"]
        for item in linked.metadata["resourceAccess"]
        if item["key"].startswith("file:")
    )
    assert direct_file_keys == linked_file_keys


def test_full_file_write_rejects_a_stale_cross_task_observation(
    tmp_path: Path,
) -> None:
    registry = create_default_tool_registry()
    target = tmp_path / "shared.txt"
    target.write_text("initial", encoding="utf-8")
    first_context = ToolContext(
        workspace_path=tmp_path.resolve(),
        task_id="task-first",
    )
    second_context = ToolContext(
        workspace_path=tmp_path.resolve(),
        task_id="task-second",
    )

    asyncio.run(
        registry.execute("read_file", first_context, {"path": "shared.txt"})
    )
    asyncio.run(
        registry.execute("read_file", second_context, {"path": "shared.txt"})
    )
    asyncio.run(
        registry.execute(
            "write_file",
            second_context,
            {"path": "shared.txt", "content": "second"},
        )
    )

    with pytest.raises(ValueError, match="其他任务修改"):
        asyncio.run(
            registry.execute(
                "write_file",
                first_context,
                {"path": "shared.txt", "content": "first stale"},
            )
        )

    assert target.read_text(encoding="utf-8") == "second"
    asyncio.run(
        registry.execute("read_file", first_context, {"path": "shared.txt"})
    )
    asyncio.run(
        registry.execute(
            "write_file",
            first_context,
            {"path": "shared.txt", "content": "first refreshed"},
        )
    )
    assert target.read_text(encoding="utf-8") == "first refreshed"


def test_full_file_write_isolates_observations_between_sibling_agents(
    tmp_path: Path,
) -> None:
    registry = create_default_tool_registry()
    target = tmp_path / "shared-by-agents.txt"
    target.write_text("initial", encoding="utf-8")
    first_context = ToolContext(
        workspace_path=tmp_path.resolve(),
        task_id="shared-task",
        session_id="shared-task:agent:first",
        agent_id="first",
    )
    second_context = ToolContext(
        workspace_path=tmp_path.resolve(),
        task_id="shared-task",
        session_id="shared-task:agent:second",
        agent_id="second",
    )

    asyncio.run(
        registry.execute("read_file", first_context, {"path": target.name})
    )
    asyncio.run(
        registry.execute("read_file", second_context, {"path": target.name})
    )
    asyncio.run(
        registry.execute(
            "write_file",
            second_context,
            {"path": target.name, "content": "second"},
        )
    )

    with pytest.raises(ValueError, match="其他 Agent 修改"):
        asyncio.run(
            registry.execute(
                "write_file",
                first_context,
                {"path": target.name, "content": "stale first"},
            )
        )

    assert target.read_text(encoding="utf-8") == "second"


def test_full_file_overwrite_requires_a_prior_task_observation(
    tmp_path: Path,
) -> None:
    registry = create_default_tool_registry()
    target = tmp_path / "existing.txt"
    target.write_text("existing", encoding="utf-8")
    context = ToolContext(
        workspace_path=tmp_path.resolve(),
        task_id="task-1",
    )

    with pytest.raises(ValueError, match="必须先读取"):
        asyncio.run(
            registry.execute(
                "write_file",
                context,
                {"path": "existing.txt", "content": "blind overwrite"},
            )
        )

    assert target.read_text(encoding="utf-8") == "existing"


def test_default_registry_exposes_large_file_tools() -> None:
    assert create_default_tool_registry().names() == (
        "update_plan",
        "artifact_read",
        "artifact_search",
        "read_pdf",
        "search_pdf",
        "list_files",
        "search_in_file",
        "read_file",
        "apply_patch",
        "write_file",
        "shell_command",
        "shell_process",
        "load_skill",
        "read_skill_resource",
    )


def test_legacy_tool_runtime_import_keeps_default_registry_compatible() -> None:
    registry = create_default_tool_registry()
    compatible = create_compatible_registry()
    expected_names = (
        "update_plan",
        "artifact_read",
        "artifact_search",
        "read_pdf",
        "search_pdf",
        "list_files",
        "search_in_file",
        "read_file",
        "apply_patch",
        "write_file",
        "shell_command",
        "shell_process",
        "load_skill",
        "read_skill_resource",
    )
    assert compatible.names() == expected_names
    assert compatible.model_definitions(expected_names) == registry.model_definitions(
        expected_names
    )
