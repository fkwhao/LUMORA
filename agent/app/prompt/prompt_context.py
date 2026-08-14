from dataclasses import dataclass
from typing import Any

from app.skill.catalog import SkillSummary


@dataclass(frozen=True, slots=True)
class PromptContext:
    """构建 System Prompt 时允许注入的非敏感运行时上下文。"""

    workspace_path: str | None = None
    project_instructions: tuple[str, ...] = ()
    available_tools: tuple[str, ...] = ()
    mcp_tool_names: tuple[str, ...] = ()
    tool_definitions: tuple[dict[str, Any], ...] = ()
    memory_summary: str | None = None
    user_memory: tuple[str, ...] = ()
    project_memory: tuple[str, ...] = ()
    conversation_memory: tuple[str, ...] = ()
    selected_memory_ids: tuple[str, ...] = ()
    conversation_summary: str | None = None
    available_skills: tuple[SkillSummary, ...] = ()
