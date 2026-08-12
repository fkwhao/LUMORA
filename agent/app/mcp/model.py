from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True, slots=True)
class McpServerConfig:
    server_id: str
    name: str
    url: str
    enabled: bool = True
    auth_type: str = "none"
    header_name: str | None = None
    credential: str | None = field(default=None, repr=False)

    def authentication_headers(self) -> dict[str, str]:
        if self.auth_type == "none":
            return {}
        if not self.credential:
            raise ValueError(f"MCP Server {self.name} 缺少静态凭据")
        if self.auth_type == "bearer":
            return {"Authorization": f"Bearer {self.credential}"}
        if self.auth_type in {"api_key", "custom_header"} and self.header_name:
            return {self.header_name: self.credential}
        raise ValueError(f"MCP Server {self.name} 的静态认证配置无效")


@dataclass(frozen=True, slots=True)
class McpToolDefinition:
    name: str
    description: str
    input_schema: Mapping[str, Any]
    annotations: Mapping[str, Any]


@dataclass(frozen=True, slots=True)
class McpResourceDefinition:
    uri: str
    name: str
    title: str
    description: str
    mime_type: str
    annotations: Mapping[str, Any]

    def as_dict(self) -> dict[str, Any]:
        return {
            "uri": self.uri,
            "name": self.name,
            "title": self.title,
            "description": self.description,
            "mimeType": self.mime_type,
            "annotations": dict(self.annotations),
        }


@dataclass(frozen=True, slots=True)
class McpResourceTemplateDefinition:
    uri_template: str
    name: str
    title: str
    description: str
    mime_type: str
    annotations: Mapping[str, Any]

    def as_dict(self) -> dict[str, Any]:
        return {
            "uriTemplate": self.uri_template,
            "name": self.name,
            "title": self.title,
            "description": self.description,
            "mimeType": self.mime_type,
            "annotations": dict(self.annotations),
        }


@dataclass(frozen=True, slots=True)
class McpPromptArgument:
    name: str
    description: str
    required: bool

    def as_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "required": self.required,
        }


@dataclass(frozen=True, slots=True)
class McpPromptDefinition:
    name: str
    title: str
    description: str
    arguments: tuple[McpPromptArgument, ...]

    def as_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "title": self.title,
            "description": self.description,
            "arguments": [argument.as_dict() for argument in self.arguments],
        }


@dataclass(frozen=True, slots=True)
class McpTestResult:
    server_name: str
    server_version: str
    tools: tuple[str, ...]
    resources: tuple[str, ...]
    resource_templates: tuple[str, ...]
    prompts: tuple[str, ...]
    echo_output: str | None = None
