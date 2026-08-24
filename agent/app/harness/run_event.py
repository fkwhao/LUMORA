from dataclasses import dataclass, field
from typing import Any, Literal, TypeAlias

RunEventType: TypeAlias = Literal[
    "text_delta",
    "text_reset",
    "reasoning_delta",
    "protocol_message",
    "progress_message",
    "agent_started",
    "agent_event",
    "agent_completed",
    "agent_failed",
    "agent_session_created",
    "agent_inbox_enqueued",
    "agent_activation_started",
    "agent_activation_interrupted",
    "agent_reported",
    "agent_checkpointed",
    "agent_peer_message_queued",
    "agent_peer_message_delivered",
    "agent_peer_message_consumed",
    "tool_started",
    "tool_completed",
    "tool_failed",
    "tool_approval_requested",
    "tool_approval_resolved",
    "approval_review_started",
    "approval_review_completed",
    "web_search_started",
    "web_search_progress",
    "web_search_completed",
    "web_search_failed",
    "context_compaction_started",
    "context_compaction_progress",
    "context_compacted",
    "context_compaction_failed",
    "usage",
    "steer_claimed",
    "paused",
    "completed",
    "failed",
]


@dataclass(frozen=True, slots=True)
class RunUsage:
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    reasoning_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    cache_metrics_available: bool = False

    def __post_init__(self) -> None:
        if (
            self.input_tokens == 0
            and self.prompt_tokens > 0
            and not self.cache_metrics_available
            and self.cache_read_tokens == 0
            and self.cache_write_tokens == 0
        ):
            object.__setattr__(self, "input_tokens", self.prompt_tokens)
        if (
            self.output_tokens == 0
            and self.completion_tokens > 0
            and self.reasoning_tokens == 0
        ):
            object.__setattr__(self, "output_tokens", self.completion_tokens)


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
