from dataclasses import dataclass
from typing import Any

from app.prompt.prompt_segment import PromptSegment, PromptTarget


@dataclass(frozen=True, slots=True)
class PromptAssembly:
    segments: tuple[PromptSegment, ...]

    @property
    def system_messages(self) -> tuple[dict[str, str], ...]:
        return tuple(
            {"role": "system", "content": segment.content}
            for segment in self.segments
            if segment.target == PromptTarget.SYSTEM
            and isinstance(segment.content, str)
        )

    @property
    def context_messages(self) -> tuple[dict[str, str], ...]:
        return tuple(
            {"role": segment.role, "content": segment.content}
            for segment in self.segments
            if segment.target == PromptTarget.MESSAGES
            and isinstance(segment.content, str)
        )

    @property
    def tools(self) -> tuple[dict[str, Any], ...]:
        return tuple(
            segment.content
            for segment in self.segments
            if segment.target == PromptTarget.TOOLS
            and isinstance(segment.content, dict)
        )

    @property
    def system_prompt(self) -> str:
        return "\n\n".join(
            message["content"] for message in self.system_messages
        )
