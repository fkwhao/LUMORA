from pathlib import Path


class ProjectInstructionLoader:
    """从工作区读取可信静态规则，不把它们写入动态 Memory。"""

    _RELATIVE_PATHS = (
        Path("AGENTS.md"),
        Path("CLAUDE.md"),
        Path(".lumora") / "AGENTS.md",
        Path(".lumora") / "CLAUDE.md",
    )
    _MAX_FILE_CHARACTERS = 32_000
    _MAX_TOTAL_CHARACTERS = 64_000

    def load(self, workspace_path: str | None) -> tuple[str, ...]:
        if not workspace_path:
            return ()
        workspace = Path(workspace_path).expanduser().resolve(strict=True)
        if not workspace.is_dir():
            raise ValueError("工作区路径不是目录")
        instructions: list[str] = []
        used = 0
        for relative in self._RELATIVE_PATHS:
            path = (workspace / relative).resolve()
            if not path.is_relative_to(workspace) or not path.is_file():
                continue
            content = path.read_text(encoding="utf-8")
            if not content.strip():
                continue
            remaining = self._MAX_TOTAL_CHARACTERS - used
            if remaining <= 0:
                break
            bounded = content[: min(self._MAX_FILE_CHARACTERS, remaining)]
            instructions.append(f"## {relative.as_posix()}\n{bounded.strip()}")
            used += len(bounded)
        return tuple(instructions)
