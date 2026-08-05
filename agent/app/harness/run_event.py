from dataclasses import dataclass, field
from typing import Any, Literal, TypeAlias

RunEventType: TypeAlias = Literal[
    "text_delta",
    "reasoning_delta",
    "progress_message",
    "tool_started",
    "tool_completed",
    "tool_failed",
    "tool_approval_requested",
    "tool_approval_resolved",
    "context_compaction_started",
    "context_compaction_progress",
    "context_compacted",
    "context_compaction_failed",
    "usage",
    "completed",
    "failed",
]


@dataclass(frozen=True, slots=True)
class RunUsage:
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


@dataclass(frozen=True, slots=True)
class RunEvent:
    """Transport-neutral event emitted by the model and Agent runtime."""

    type: RunEventType
    delta: str = ""
    model: str = ""
    usage: RunUsage | None = None
    active_context_tokens: int = 0
    error_message: str = ""
    item_id: str = ""
    tool_call_id: str = ""
    tool_name: str = ""
    title: str = ""
    arguments: dict[str, Any] | None = None
    output: str = ""
    duration_ms: int = 0
    exit_code: int | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    approval_id: str = ""
    permission_layer: str = ""
    reason: str = ""
    risk_level: str = ""
    reversible: bool | None = None
    decision: Literal["allow", "deny", ""] = ""
