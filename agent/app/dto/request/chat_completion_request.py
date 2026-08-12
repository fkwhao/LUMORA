from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


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
    api_format: Literal[
        "anthropic", "chat-completions", "responses"
    ] = Field(default="chat-completions", alias="apiFormat")
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
    web_search_enabled: bool = Field(
        default=False,
        alias="webSearchEnabled",
    )


class PermissionRuleRequest(BaseModel):
    tool: str = Field(min_length=1, max_length=100)
    pattern: str = Field(default="*", min_length=1, max_length=20_000)
    decision: Literal["allow", "deny", "ask"] = "ask"


class MemoryContextRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    memory_id: str = Field(alias="memoryId", min_length=1, max_length=100)
    scope: Literal["USER", "PROJECT", "CONVERSATION"]
    type: Literal[
        "PREFERENCE", "FACT", "DECISION", "CONSTRAINT", "SUMMARY"
    ]
    content: str = Field(min_length=1, max_length=4_000)
    importance: float = Field(default=0.5, ge=0.0, le=1.0)
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    usage_count: int = Field(default=0, alias="usageCount", ge=0)
    last_used_time: datetime | None = Field(
        default=None, alias="lastUsedTime"
    )
    updated_time: datetime = Field(alias="updatedTime")


class McpServerRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    server_id: str = Field(
        alias="serverId",
        min_length=1,
        max_length=80,
        pattern=r"^[A-Za-z0-9._-]+$",
    )
    name: str = Field(min_length=1, max_length=120)
    enabled: bool = True
    url: str = Field(max_length=2000)
    auth_type: Literal[
        "none", "bearer", "api_key", "custom_header"
    ] = Field(default="none", alias="authType")
    header_name: str | None = Field(
        default=None,
        alias="headerName",
        max_length=100,
        pattern=r"^[!#$%&'*+.^_`|~0-9A-Za-z-]+$",
    )
    credential: str | None = Field(default=None, max_length=4096, repr=False)

    @model_validator(mode="after")
    def validate_transport_fields(self) -> "McpServerRequest":
        if not self.url.strip().startswith(("http://", "https://")):
            raise ValueError("远程 MCP Server 必须配置 HTTP(S) 地址")
        if self.auth_type in {"api_key", "custom_header"} and not self.header_name:
            raise ValueError("API Key 或自定义 Header 认证必须配置 Header 名称")
        if self.auth_type != "none" and not self.credential:
            raise ValueError("静态认证必须提供凭据")
        if self.header_name and self.header_name.casefold() in {
            "accept",
            "authorization",
            "connection",
            "content-length",
            "content-type",
            "cookie",
            "host",
            "mcp-protocol-version",
            "mcp-session-id",
            "proxy-authorization",
            "set-cookie",
            "transfer-encoding",
        }:
            raise ValueError("该 Header 名称由 MCP 传输层保留")
        return self


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
    memory_candidates: list[MemoryContextRequest] = Field(
        default_factory=list,
        alias="memoryCandidates",
        max_length=60,
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
    mcp_servers: list[McpServerRequest] = Field(
        default_factory=list,
        alias="mcpServers",
        max_length=20,
    )


class ChatCompletionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    messages: list[ChatMessageRequest] = Field(min_length=1, max_length=100)
    connection: ModelConnectionRequest
    prompt_context: PromptContextRequest = Field(
        default_factory=PromptContextRequest,
        alias="promptContext",
    )
    reasoning_effort: str | None = (
        Field(
            default=None,
            alias="reasoningEffort",
            min_length=1,
            max_length=64,
            pattern=r"^[A-Za-z0-9._-]+$",
        )
    )
