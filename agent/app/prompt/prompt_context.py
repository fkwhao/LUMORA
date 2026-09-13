from dataclasses import dataclass
from typing import Any

from app.prompt.prompt_errors import PromptConfigurationError
from app.prompt.prompt_metadata import normalize_prompt_conflict_key
from app.prompt.prompt_segment import PromptSegment
from app.skill.catalog import SkillSummary


@dataclass(frozen=True, slots=True)
class ProjectInstructionInput:
    """跨越 Core 边界传递的结构化上游项目规则数据。"""

    content: str
    source_ref: str | None = None
    conflict_key: str | None = None
    scope: str = "workspace"

    def __post_init__(self) -> None:
        if not isinstance(self.content, str) or not self.content.strip():
            raise PromptConfigurationError("结构化项目规则内容不能为空")
        if not isinstance(self.scope, str) or not self.scope.strip():
            raise PromptConfigurationError("结构化项目规则 scope 不能为空")
        normalized_scope = self.scope.strip()
        if normalized_scope != "workspace":
            raise PromptConfigurationError(
                "结构化项目规则目前只支持 scope: workspace"
            )
        if self.source_ref is not None:
            if not isinstance(self.source_ref, str):
                raise PromptConfigurationError(
                    "结构化项目规则 source_ref 无效"
                )
            normalized_source_ref = self.source_ref.strip()
            object.__setattr__(
                self,
                "source_ref",
                normalized_source_ref or None,
            )
        if self.conflict_key is not None:
            try:
                normalized_conflict_key = normalize_prompt_conflict_key(
                    self.conflict_key
                )
            except (TypeError, ValueError) as error:
                raise PromptConfigurationError(
                    "结构化项目规则 conflict_key 无效"
                ) from error
            object.__setattr__(self, "conflict_key", normalized_conflict_key)
            if self.source_ref is None:
                raise PromptConfigurationError(
                    "设置 conflict_key 时 source_ref 不能为空"
                )
        object.__setattr__(self, "content", self.content.strip())
        object.__setattr__(self, "scope", normalized_scope)


@dataclass(frozen=True, slots=True)
class PromptContext:
    """构建 System Prompt 时允许注入的非敏感运行时上下文。"""

    workspace_path: str | None = None
    task_id: str | None = None
    current_user_task: str | None = None
    project_instructions: tuple[str, ...] = ()
    project_instruction_inputs: tuple[ProjectInstructionInput, ...] = ()
    project_instruction_segments: tuple[PromptSegment, ...] = ()
    runtime_segments: tuple[PromptSegment, ...] = ()
    available_tools: tuple[str, ...] = ()
    mcp_tool_names: tuple[str, ...] = ()
    system_reminders: tuple[str, ...] = ()
    tool_definitions: tuple[dict[str, Any], ...] = ()
    memory_summary: str | None = None
    user_memory: tuple[str, ...] = ()
    project_memory: tuple[str, ...] = ()
    conversation_memory: tuple[str, ...] = ()
    selected_memory_ids: tuple[str, ...] = ()
    memory_provenance: tuple[tuple[str, str, str | None], ...] = ()
    conversation_summary: str | None = None
    available_skills: tuple[SkillSummary, ...] = ()
