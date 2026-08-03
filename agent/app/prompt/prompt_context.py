from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class PromptContext:
    """构建 System Prompt 时允许注入的非敏感运行时上下文。"""

    response_language: str = "简体中文"
    workspace_path: str | None = None
    project_instructions: tuple[str, ...] = ()
    available_tools: tuple[str, ...] = ()
    tool_definitions: tuple[dict[str, Any], ...] = ()
    memory_summary: str | None = None
    system_reminders: tuple[str, ...] = ()
