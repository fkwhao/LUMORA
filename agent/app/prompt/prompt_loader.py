from pathlib import Path
from typing import ClassVar


class PromptLoader:
    """按固定顺序加载 LUMORA 自有的静态 Prompt 片段。"""

    _SECTION_FILES = (
        "00_identity.md",
        "10_collaboration.md",
        "20_execution.md",
        "30_tools_and_safety.md",
        "40_response.md",
    )
    _SPECIALIZED_FILES: ClassVar[dict[str, str]] = {
        "memory_extraction": "memory_extraction.md",
    }

    def __init__(self, template_directory: Path | None = None) -> None:
        self._template_directory = (
            template_directory
            if template_directory is not None
            else Path(__file__).resolve().parent / "templates"
        )
        self._cached_sections: tuple[str, ...] | None = None

    def load_static_sections(self) -> tuple[str, ...]:
        """读取并缓存静态片段，避免每次模型请求都访问磁盘。"""
        if self._cached_sections is not None:
            return self._cached_sections

        sections: list[str] = []
        for file_name in self._SECTION_FILES:
            path = self._template_directory / file_name
            content = path.read_text(encoding="utf-8").strip()
            if not content:
                raise ValueError(f"System Prompt 片段不能为空：{file_name}")
            sections.append(content)
        self._cached_sections = tuple(sections)
        return self._cached_sections

    def load_specialized(self, name: str) -> str:
        """加载受控的专用 Prompt，调用方不能传入任意文件路径。"""
        try:
            file_name = self._SPECIALIZED_FILES[name]
        except KeyError as error:
            raise ValueError(f"未知专用 Prompt：{name}") from error
        content = (self._template_directory / file_name).read_text(
            encoding="utf-8"
        ).strip()
        if not content:
            raise ValueError(f"专用 Prompt 不能为空：{file_name}")
        return content
