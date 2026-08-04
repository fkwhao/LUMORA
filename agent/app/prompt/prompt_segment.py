from dataclasses import dataclass
from enum import StrEnum
from typing import Any, Literal


class PromptTarget(StrEnum):
    SYSTEM = "system"
    MESSAGES = "messages"
    TOOLS = "tools"


class PromptTrustLevel(StrEnum):
    TRUSTED = "trusted"
    USER_CONTEXT = "user_context"
    UNTRUSTED = "untrusted"


class PromptPriority(StrEnum):
    REQUIRED = "required"
    COMPRESSIBLE = "compressible"
    DISCARDABLE = "discardable"


class PromptCachePolicy(StrEnum):
    STATIC = "static"
    TASK = "task"
    REQUEST = "request"


@dataclass(frozen=True, slots=True)
class PromptSegment:
    key: str
    target: PromptTarget
    content: str | dict[str, Any]
    trust_level: PromptTrustLevel
    priority: PromptPriority
    cache_policy: PromptCachePolicy
    role: Literal["system", "user", "assistant"] = "system"

    def __post_init__(self) -> None:
        if (
            self.target == PromptTarget.SYSTEM
            and self.trust_level != PromptTrustLevel.TRUSTED
        ):
            raise ValueError("只有可信片段可以进入 system")
        if self.target == PromptTarget.TOOLS:
            if self.trust_level != PromptTrustLevel.TRUSTED:
                raise ValueError("只有可信工具定义可以进入 tools")
            if not isinstance(self.content, dict):
                raise ValueError("tools 片段必须是 JSON Schema 对象")
        elif not isinstance(self.content, str):
            raise ValueError("system/messages 片段必须是文本")
