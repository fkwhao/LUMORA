from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.dto.response.chat_completion_response import TokenUsageResponse


class ChatStreamEventResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    type: Literal[
        "text_delta",
        "reasoning_delta",
        "progress_message",
        "tool_started",
        "tool_completed",
        "tool_failed",
        "tool_approval_requested",
        "tool_approval_resolved",
        "usage",
        "completed",
        "failed",
    ]
    delta: str = ""
    model: str = ""
    usage: TokenUsageResponse | None = None
    error_message: str = Field(default="", alias="errorMessage")
    item_id: str = Field(default="", alias="itemId")
    tool_call_id: str = Field(default="", alias="toolCallId")
    tool_name: str = Field(default="", alias="toolName")
    title: str = ""
    arguments: dict[str, Any] | None = None
    output: str = ""
    duration_ms: int = Field(default=0, alias="durationMs")
    exit_code: int | None = Field(default=None, alias="exitCode")
    metadata: dict[str, Any] = Field(default_factory=dict)
    approval_id: str = Field(default="", alias="approvalId")
    permission_layer: str = Field(default="", alias="permissionLayer")
    reason: str = ""
    risk_level: str = Field(default="", alias="riskLevel")
    reversible: bool | None = None
    decision: Literal["allow", "deny", ""] = ""
