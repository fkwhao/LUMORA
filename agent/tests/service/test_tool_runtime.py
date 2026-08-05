import asyncio
from pathlib import Path

import pytest
from app.tool.base import ToolContext
from app.tool.default_registry import create_default_tool_registry
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
    assert not (tmp_path / ".source.ts.lumora-tmp").exists()


def test_default_registry_exposes_large_file_tools() -> None:
    assert create_default_tool_registry().names() == (
        "artifact_read",
        "artifact_search",
        "list_files",
        "search_in_file",
        "read_file",
        "apply_patch",
        "write_file",
        "shell_command",
    )


def test_legacy_tool_runtime_import_keeps_default_registry_compatible() -> None:
    registry = create_default_tool_registry()
    compatible = create_compatible_registry()
    expected_names = (
        "artifact_read",
        "artifact_search",
        "list_files",
        "search_in_file",
        "read_file",
        "apply_patch",
        "write_file",
        "shell_command",
    )
    assert compatible.names() == expected_names
    assert compatible.model_definitions(expected_names) == registry.model_definitions(
        expected_names
    )
