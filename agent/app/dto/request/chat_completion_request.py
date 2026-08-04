from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ChatMessageRequest(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=100_000)


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


class ChatCompletionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    messages: list[ChatMessageRequest] = Field(min_length=1, max_length=100)
    connection: ModelConnectionRequest
    prompt_context: PromptContextRequest = Field(
        default_factory=PromptContextRequest,
        alias="promptContext",
    )
    reasoning_effort: Literal[
        "low", "medium", "high", "xhigh", "max"
    ] | None = (
        Field(default=None, alias="reasoningEffort")
    )
