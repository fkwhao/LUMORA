from app.prompt.project_instruction_loader import ProjectInstructionLoader


def test_loads_supported_project_instruction_files(tmp_path) -> None:
    (tmp_path / "AGENTS.md").write_text("根目录规则", encoding="utf-8")
    nested = tmp_path / ".lumora"
    nested.mkdir()
    (nested / "CLAUDE.md").write_text("LUMORA 规则", encoding="utf-8")
    (tmp_path / "README.md").write_text("不应注入", encoding="utf-8")

    instructions = ProjectInstructionLoader().load(str(tmp_path))

    assert instructions == (
        "## AGENTS.md\n根目录规则",
        "## .lumora/CLAUDE.md\nLUMORA 规则",
    )
