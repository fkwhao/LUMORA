import re
from datetime import datetime
from pathlib import PureWindowsPath
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ChatToolCallRequest(BaseModel):
    id: str = Field(min_length=1, max_length=500)
    name: str = Field(min_length=1, max_length=500)
    arguments: str = Field(default="{}", max_length=1_000_000)


class ChatAttachmentRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    attachment_id: str = Field(alias="attachmentId", min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=260)
    mime_type: str = Field(alias="mimeType", min_length=1, max_length=160)
    size: int = Field(ge=0, le=25 * 1024 * 1024)
    path: str = Field(min_length=1, max_length=4000)
    kind: Literal["IMAGE", "FILE"]
    source: Literal["LOCAL_FILE", "CLIPBOARD_TEMP"]


class ChatMessageRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    role: Literal["user", "assistant", "tool"]
    content: str | None = Field(default=None, max_length=1_000_000)
    message_id: str | None = Field(default=None, alias="messageId")
    sequence: int | None = Field(default=None, ge=1)
    tool_calls: list[ChatToolCallRequest] = Field(
        default_factory=list,
        alias="toolCalls",
        max_length=128,
    )
    tool_call_id: str | None = Field(
        default=None,
        alias="toolCallId",
        max_length=500,
    )
    attachments: list[ChatAttachmentRequest] = Field(
        default_factory=list,
        max_length=10,
    )
    provider_state: dict[str, Any] = Field(
        default_factory=dict,
        alias="providerState",
    )

    @model_validator(mode="after")
    def validate_protocol_message(self) -> "ChatMessageRequest":
        if self.role == "user" and not (self.content or "").strip():
            raise ValueError("用户消息内容不能为空")
        if self.role == "assistant" and not (
            (self.content or "").strip() or self.tool_calls
        ):
            raise ValueError("助手消息必须包含内容或工具调用")
        if self.role == "tool" and not self.tool_call_id:
            raise ValueError("工具消息必须关联工具调用 ID")
        if self.role != "assistant" and self.tool_calls:
            raise ValueError("只有助手消息可以包含工具调用")
        if self.role != "user" and self.attachments:
            raise ValueError("只有用户消息可以包含附件")
        if self.role != "assistant" and self.provider_state:
            raise ValueError("只有助手消息可以包含 Provider 续传状态")
        return self

    def as_provider_message(self) -> dict[str, object]:
        message: dict[str, object] = {
            "role": self.role,
            "content": self.content,
        }
        if self.tool_calls:
            message["tool_calls"] = [
                {
                    "id": call.id,
                    "type": "function",
                    "function": {
                        "name": call.name,
                        "arguments": call.arguments,
                    },
                }
                for call in self.tool_calls
            ]
        if self.tool_call_id:
            message["tool_call_id"] = self.tool_call_id
        if self.attachments:
            message["attachments"] = [
                attachment.model_dump(by_alias=True) for attachment in self.attachments
            ]
        if self.provider_state:
            message["provider_state"] = dict(self.provider_state)
        return message


class AgentInboxMessageRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    message_id: str = Field(alias="messageId", min_length=1, max_length=160)
    sequence: int = Field(ge=1)
    sender_agent_id: str = Field(alias="senderAgentId", min_length=1, max_length=160)
    content: str = Field(min_length=1, max_length=100_000)
    status: Literal["pending", "consumed"] = "pending"
    kind: Literal["task", "peer"] = Field(default="task", alias="messageKind")
    sender_label: str | None = Field(default=None, alias="senderLabel", max_length=120)


class AgentCheckpointRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    sequence: int = Field(ge=0)
    consumed_inbox_sequence: int = Field(default=0, alias="consumedInboxSequence", ge=0)
    transcript: list[ChatMessageRequest] = Field(
        default_factory=list, max_length=10_000
    )
    summary: str | None = Field(default=None, max_length=100_000)


class AgentSessionSnapshotRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    agent_id: str = Field(alias="agentId", min_length=1, max_length=160)
    session_id: str = Field(alias="sessionId", min_length=1, max_length=500)
    parent_agent_id: str = Field(alias="parentAgentId", min_length=1, max_length=160)
    parent_session_id: str = Field(
        alias="parentSessionId", min_length=1, max_length=500
    )
    team_id: str | None = Field(default=None, alias="teamId", max_length=160)
    active_activation_id: str | None = Field(
        default=None, alias="activeActivationId", max_length=160
    )
    label: str = Field(min_length=1, max_length=120)
    status: Literal["idle", "running", "interrupted", "closed", "failed"] = "idle"
    mode: Literal["one_shot", "continuable"] = "continuable"
    delegation_depth: int = Field(alias="delegationDepth", ge=1, le=20)
    model: str = Field(default="", max_length=160)
    unread_report_count: int = Field(default=0, alias="unreadReportCount", ge=0)
    latest_report: str | None = Field(
        default=None, alias="latestReport", max_length=100_000
    )
    inbox: list[AgentInboxMessageRequest] = Field(
        default_factory=list, max_length=2_000
    )
    checkpoint: AgentCheckpointRequest | None = None


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
        "anthropic", "chat-completions", "responses", "lumora-cloud"
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
    type: Literal["PREFERENCE", "FACT", "DECISION", "CONSTRAINT", "SUMMARY"]
    content: str = Field(min_length=1, max_length=4_000)
    importance: float = Field(default=0.5, ge=0.0, le=1.0)
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    usage_count: int = Field(default=0, alias="usageCount", ge=0)
    last_used_time: datetime | None = Field(default=None, alias="lastUsedTime")
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
    transport: Literal["streamable_http", "stdio"] = Field(
        default="streamable_http",
        alias="transportType",
    )
    url: str | None = Field(default=None, max_length=2000)
    command: str | None = Field(default=None, max_length=1000)
    arguments: list[str] = Field(
        default_factory=list,
        max_length=64,
        repr=False,
    )
    working_directory: str | None = Field(
        default=None,
        alias="workingDirectory",
        max_length=2000,
    )
    environment: dict[str, str] = Field(
        default_factory=dict,
        max_length=64,
        repr=False,
    )
    auth_type: Literal["none", "bearer", "api_key", "custom_header"] = Field(
        default="none", alias="authType"
    )
    header_name: str | None = Field(
        default=None,
        alias="headerName",
        max_length=100,
        pattern=r"^[!#$%&'*+.^_`|~0-9A-Za-z-]+$",
    )
    credential: str | None = Field(default=None, max_length=4096, repr=False)

    @model_validator(mode="after")
    def validate_transport_fields(self) -> "McpServerRequest":
        if self.transport == "streamable_http":
            if not (self.url or "").strip().startswith(("http://", "https://")):
                raise ValueError("远程 MCP Server 必须配置 HTTP(S) 地址")
            if (
                self.command
                or self.arguments
                or self.working_directory
                or self.environment
            ):
                raise ValueError("HTTP MCP Server 不能包含 stdio 启动配置")
        else:
            command = (self.command or "").strip()
            if not command:
                raise ValueError("stdio MCP Server 必须配置启动命令")
            if any(character in command for character in ("\0", "\r", "\n")):
                raise ValueError("stdio 启动命令包含无效字符")
            if self.url:
                raise ValueError("stdio MCP Server 不能配置 HTTP 地址")
            if self.auth_type != "none" or self.header_name or self.credential:
                raise ValueError("stdio MCP Server 不使用 HTTP 静态认证")
            if (
                self.working_directory
                and not PureWindowsPath(self.working_directory).is_absolute()
            ):
                raise ValueError("stdio 工作目录必须是 Windows 绝对路径")
            if self.working_directory and any(
                character in self.working_directory
                for character in ("\0", "\r", "\n")
            ):
                raise ValueError("stdio 工作目录包含无效字符")
            for argument in self.arguments:
                if len(argument) > 2000 or any(
                    character in argument for character in ("\0", "\r", "\n")
                ):
                    raise ValueError("stdio 参数格式无效")
            normalized_environment_keys: set[str] = set()
            for key, value in self.environment.items():
                if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,127}", key):
                    raise ValueError(f"stdio 环境变量名称无效：{key}")
                normalized_key = key.casefold()
                if normalized_key in normalized_environment_keys:
                    raise ValueError(f"stdio 环境变量名称重复：{key}")
                normalized_environment_keys.add(normalized_key)
                if len(value) > 4096 or "\0" in value:
                    raise ValueError(f"stdio 环境变量值无效：{key}")
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


class ExecutionBudgetRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    max_model_requests: int = Field(
        default=256,
        alias="maxModelRequests",
        ge=1,
        le=100_000,
    )
    max_tool_calls: int = Field(
        default=1_024,
        alias="maxToolCalls",
        ge=1,
        le=1_000_000,
    )
    max_wall_time_ms: int = Field(
        default=7_200_000,
        alias="maxWallTimeMs",
        ge=1_000,
        le=604_800_000,
    )
    max_active_agents: int = Field(
        default=10,
        alias="maxActiveAgents",
        ge=1,
        le=100,
    )


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
    permission_mode: Literal["full_access", "auto_approve", "request_approval"] = Field(
        default="request_approval", alias="permissionMode"
    )
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
    agent_sessions: list[AgentSessionSnapshotRequest] = Field(
        default_factory=list,
        alias="agentSessions",
        max_length=200,
    )
    workflow_snapshots: list[dict[str, object]] = Field(
        default_factory=list,
        alias="workflowSnapshots",
        max_length=100,
    )
    execution_budget: ExecutionBudgetRequest = Field(
        default_factory=ExecutionBudgetRequest,
        alias="executionBudget",
    )


class ChatCompletionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    messages: list[ChatMessageRequest] = Field(min_length=1, max_length=10_000)
    connection: ModelConnectionRequest
    prompt_context: PromptContextRequest = Field(
        default_factory=PromptContextRequest,
        alias="promptContext",
    )
    reasoning_effort: str | None = Field(
        default=None,
        alias="reasoningEffort",
        min_length=1,
        max_length=64,
        pattern=r"^[A-Za-z0-9._-]+$",
    )
