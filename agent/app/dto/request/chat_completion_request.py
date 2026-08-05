from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ChatMessageRequest(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=100_000)
    message_id: str | None = Field(default=None, alias="messageId")
    sequence: int | None = Field(default=None, ge=1)


class ModelConnectionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    provider_name: str = Field(
        alias="providerName",
        min_length=1,
        max_length=80,
    )
    base_url: str = Field(alias="baseUrl", min_length=1, max_length=500)
    model: str = Field(min_length=1, max_length=160)
    api_key: str = Field(alias="apiKey", min_length=1, max_length=2048)
    max_output_tokens: int | None = Field(
        default=None,
        alias="maxOutputTokens",
        ge=1,
        le=10_000_000,
    )
    context_window: int | None = Field(
        default=None,
        alias="contextWindow",
        ge=1,
        le=10_000_000,
    )


class PermissionRuleRequest(BaseModel):
    tool: str = Field(min_length=1, max_length=100)
    pattern: str = Field(default="*", min_length=1, max_length=20_000)
    decision: Literal["allow", "deny", "ask"] = "ask"


class PromptContextRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    workspace_path: str | None = Field(
        default=None,
        alias="workspacePath",
        max_length=1000,
    )
    project_instructions: list[str] = Field(
        default_factory=list,
        alias="projectInstructions",
        max_length=100,
    )
    available_tools: list[str] = Field(
        default_factory=list,
        alias="availableTools",
        max_length=100,
    )
    memory_summary: str | None = Field(
        default=None,
        alias="memorySummary",
        max_length=100_000,
    )
    task_id: str | None = Field(default=None, alias="taskId", max_length=160)
    conversation_summary: str | None = Field(
        default=None,
        alias="conversationSummary",
        max_length=100_000,
    )
    permission_mode: Literal[
        "full_access", "auto_approve", "request_approval"
    ] = Field(default="request_approval", alias="permissionMode")
    permission_rules: list[PermissionRuleRequest] = Field(
        default_factory=list,
        alias="permissionRules",
        max_length=200,
    )


class ChatCompletionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    messages: list[ChatMessageRequest] = Field(min_length=1, max_length=100)
    connection: ModelConnectionRequest
    prompt_context: PromptContextRequest = Field(
        default_factory=PromptContextRequest,
        alias="promptContext",
    )
    reasoning_effort: Literal["none", "low", "high", "max"] | None = (
        Field(default=None, alias="reasoningEffort")
    )
