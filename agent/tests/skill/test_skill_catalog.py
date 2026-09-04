import asyncio
from pathlib import Path

from app.prompt.prompt_builder import PromptBuilder
from app.prompt.prompt_context import PromptContext
from app.skill.catalog import SkillCatalog
from app.tool.base import ToolContext
from app.tool.skill_tools import skill_tools


def _write_skill(root: Path, name: str, description: str, body: str) -> None:
    directory = root / name
    directory.mkdir(parents=True)
    (directory / "SKILL.md").write_text(
        f"---\nname: {name}\ndescription: {description}\n---\n{body}\n",
        encoding="utf-8",
    )


def test_discovers_metadata_with_project_precedence(tmp_path: Path) -> None:
    user_root = tmp_path / "user-skills"
    workspace = tmp_path / "workspace"
    project_root = workspace / ".lumora" / "skills"
    _write_skill(user_root, "release-notes", "个人版本", "个人 SOP")
    _write_skill(project_root, "release-notes", "项目版本", "项目 SOP")

    catalog = SkillCatalog(
        user_root=user_root,
        builtin_root=tmp_path / "builtin",
        settings_path=tmp_path / "settings.json",
    )

    summaries = catalog.discover(workspace)
    assert [(item.name, item.description, item.source) for item in summaries] == [
        ("release-notes", "项目版本", "project")
    ]
    assert "项目 SOP" not in repr(summaries)


def test_load_skill_expands_arguments_and_lists_resources(tmp_path: Path) -> None:
    root = tmp_path / "skills"
    _write_skill(root, "release-notes", "生成发布说明", "为 $ARGUMENTS 生成说明")
    (root / "release-notes" / "examples.md").write_text("示例", encoding="utf-8")
    catalog = SkillCatalog(
        user_root=root,
        builtin_root=tmp_path / "builtin",
        settings_path=tmp_path / "settings.json",
    )
    tool = skill_tools(catalog)[0]

    result = asyncio.run(tool.execute(
        ToolContext(workspace_path=tmp_path, workspace_scoped=False),
        {"name": "release-notes", "arguments": "v1.2.0"},
    ))

    assert result.is_error is False
    assert "为 v1.2.0 生成说明" in result.content
    assert "examples.md" in result.content

    resource_tool = skill_tools(catalog)[1]
    resource = asyncio.run(resource_tool.execute(
        ToolContext(workspace_path=tmp_path, workspace_scoped=False),
        {"name": "release-notes", "path": "examples.md"},
    ))
    assert resource.content == "示例"

    escaped = asyncio.run(resource_tool.execute(
        ToolContext(workspace_path=tmp_path, workspace_scoped=False),
        {"name": "release-notes", "path": "../outside.md"},
    ))
    assert escaped.is_error is True


def test_load_skill_requires_all_chunks_before_execution(tmp_path: Path) -> None:
    root = tmp_path / "skills"
    _write_skill(root, "long-sop", "长流程", "A" * 70_000)
    catalog = SkillCatalog(
        user_root=root,
        builtin_root=tmp_path / "builtin",
        settings_path=tmp_path / "settings.json",
    )
    tool = skill_tools(catalog)[0]
    context = ToolContext(workspace_path=tmp_path, workspace_scoped=False)

    first = asyncio.run(tool.execute(context, {"name": "long-sop"}))
    assert first.metadata["complete"] is False
    assert first.metadata["nextOffset"] == 30_000
    assert "加载完整前不要开始执行" in first.content

    final = asyncio.run(tool.execute(
        context,
        {"name": "long-sop", "offset": 60_000},
    ))
    assert final.metadata["complete"] is True
    assert final.metadata["nextOffset"] is None
    assert "执行 SOP" in final.content


def test_read_skill_resource_returns_bounded_chunks(tmp_path: Path) -> None:
    root = tmp_path / "skills"
    _write_skill(root, "long-resource", "长资源", "读取 examples.md")
    resource_path = root / "long-resource" / "examples.md"
    resource_path.write_text("R" * 70_000, encoding="utf-8")
    catalog = SkillCatalog(
        user_root=root,
        builtin_root=tmp_path / "builtin",
        settings_path=tmp_path / "settings.json",
    )
    resource_tool = skill_tools(catalog)[1]
    context = ToolContext(workspace_path=tmp_path, workspace_scoped=False)

    first = asyncio.run(resource_tool.execute(
        context,
        {"name": "long-resource", "path": "examples.md"},
    ))
    assert first.metadata["complete"] is False
    assert first.metadata["nextOffset"] == 30_000
    assert len(first.content) < 31_000

    final = asyncio.run(resource_tool.execute(
        context,
        {
            "name": "long-resource",
            "path": "examples.md",
            "offset": 60_000,
        },
    ))
    assert final.content == "R" * 10_000
    assert final.metadata["complete"] is True


def test_prompt_contains_only_skill_discovery_index() -> None:
    from app.skill.catalog import SkillSummary

    prompt = PromptBuilder().build(PromptContext(
        available_tools=("load_skill",),
        available_skills=(SkillSummary(
            name="release-notes",
            description="生成发布说明",
            source="project",
        ),),
    )).system_prompt

    assert "/release-notes：生成发布说明" in prompt
    assert "必须先调用 load_skill" in prompt
    assert "完整 SOP" not in prompt
