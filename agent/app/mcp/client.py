from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable, Mapping
from typing import Any

from mcp import Client as SdkClient

from app.mcp.model import (
    McpPromptArgument,
    McpPromptDefinition,
    McpResourceDefinition,
    McpResourceTemplateDefinition,
    McpServerConfig,
    McpTestResult,
    McpToolDefinition,
)
from app.mcp.transport import McpTransport, create_mcp_transport

_MAX_LIST_PAGES = 100
_MAX_LIST_ITEMS = 10_000
_CONNECT_TIMEOUT_SECONDS = 30.0


class McpConnectionError(OSError):
    pass


class McpClient:
    """LUMORA MCP facade backed by the official SDK v2 client."""

    def __init__(
        self,
        config: McpServerConfig,
        transport: McpTransport | None = None,
    ) -> None:
        self.config = config
        self._transport = transport or create_mcp_transport(config)
        self._client: SdkClient | None = None
        self._server_name = config.name
        self._server_version = ""
        self._server_capabilities: dict[str, Any] = {}

    async def connect(self) -> None:
        if self._client is not None:
            return
        try:
            async with asyncio.timeout(_CONNECT_TIMEOUT_SECONDS):
                client = await self._transport.connect()
        except asyncio.CancelledError:
            raise
        except Exception as error:
            raise McpConnectionError(self._transport_error(error)) from error

        self._client = client
        server_info = client.server_info
        if server_info is not None:
            self._server_name = server_info.name or self.config.name
            self._server_version = server_info.version or ""
        capabilities = client.server_capabilities
        if capabilities is not None:
            self._server_capabilities = _model_dict(capabilities)

    def supports(self, capability: str) -> bool:
        return capability in self._server_capabilities

    async def list_tools(self) -> tuple[McpToolDefinition, ...]:
        if not self.supports("tools"):
            return ()
        raw_tools = await self._list_all(self._require_client().list_tools, "tools")
        tools: list[McpToolDefinition] = []
        for raw in raw_tools:
            name = str(raw.get("name") or "").strip()
            if not name:
                continue
            schema = raw.get("inputSchema")
            output_schema = raw.get("outputSchema")
            annotations = raw.get("annotations")
            metadata = raw.get("_meta")
            tools.append(
                McpToolDefinition(
                    name=name,
                    description=str(raw.get("description") or "MCP tool"),
                    input_schema=(
                        dict(schema)
                        if isinstance(schema, Mapping)
                        else {"type": "object", "properties": {}}
                    ),
                    annotations=(
                        dict(annotations)
                        if isinstance(annotations, Mapping)
                        else {}
                    ),
                    output_schema=(
                        dict(output_schema)
                        if isinstance(output_schema, Mapping)
                        else None
                    ),
                    metadata=(
                        dict(metadata) if isinstance(metadata, Mapping) else {}
                    ),
                )
            )
        return tuple(tools)

    async def list_resources(self) -> tuple[McpResourceDefinition, ...]:
        if not self.supports("resources"):
            return ()
        raw_items = await self._list_all(
            self._require_client().list_resources,
            "resources",
        )
        resources: list[McpResourceDefinition] = []
        for raw in raw_items:
            uri = str(raw.get("uri") or "").strip()
            name = str(raw.get("name") or "").strip()
            if not uri or not name:
                continue
            annotations = raw.get("annotations")
            resources.append(
                McpResourceDefinition(
                    uri=uri,
                    name=name,
                    title=str(raw.get("title") or name),
                    description=str(raw.get("description") or ""),
                    mime_type=str(raw.get("mimeType") or ""),
                    annotations=(
                        dict(annotations)
                        if isinstance(annotations, Mapping)
                        else {}
                    ),
                )
            )
        return tuple(resources)

    async def list_resource_templates(
        self,
    ) -> tuple[McpResourceTemplateDefinition, ...]:
        if not self.supports("resources"):
            return ()
        raw_items = await self._list_all(
            self._require_client().list_resource_templates,
            "resourceTemplates",
        )
        templates: list[McpResourceTemplateDefinition] = []
        for raw in raw_items:
            uri_template = str(raw.get("uriTemplate") or "").strip()
            name = str(raw.get("name") or "").strip()
            if not uri_template or not name:
                continue
            annotations = raw.get("annotations")
            templates.append(
                McpResourceTemplateDefinition(
                    uri_template=uri_template,
                    name=name,
                    title=str(raw.get("title") or name),
                    description=str(raw.get("description") or ""),
                    mime_type=str(raw.get("mimeType") or ""),
                    annotations=(
                        dict(annotations)
                        if isinstance(annotations, Mapping)
                        else {}
                    ),
                )
            )
        return tuple(templates)

    async def read_resource(self, uri: str) -> Mapping[str, Any]:
        result = await self._call(
            "resources/read",
            self._require_client().read_resource(uri),
        )
        payload = _model_dict(result)
        if not isinstance(payload.get("contents"), list):
            raise McpConnectionError("MCP resources/read 返回无效结果")
        return payload

    async def list_prompts(self) -> tuple[McpPromptDefinition, ...]:
        if not self.supports("prompts"):
            return ()
        raw_items = await self._list_all(
            self._require_client().list_prompts,
            "prompts",
        )
        prompts: list[McpPromptDefinition] = []
        for raw in raw_items:
            name = str(raw.get("name") or "").strip()
            if not name:
                continue
            arguments: list[McpPromptArgument] = []
            raw_arguments = raw.get("arguments")
            if isinstance(raw_arguments, list):
                for raw_argument in raw_arguments:
                    if not isinstance(raw_argument, Mapping):
                        continue
                    argument_name = str(
                        raw_argument.get("name") or ""
                    ).strip()
                    if argument_name:
                        arguments.append(
                            McpPromptArgument(
                                name=argument_name,
                                description=str(
                                    raw_argument.get("description") or ""
                                ),
                                required=raw_argument.get("required") is True,
                            )
                        )
            prompts.append(
                McpPromptDefinition(
                    name=name,
                    title=str(raw.get("title") or name),
                    description=str(raw.get("description") or ""),
                    arguments=tuple(arguments),
                )
            )
        return tuple(prompts)

    async def get_prompt(
        self,
        name: str,
        arguments: Mapping[str, Any],
    ) -> Mapping[str, Any]:
        result = await self._call(
            "prompts/get",
            self._require_client().get_prompt(
                name,
                {key: str(value) for key, value in arguments.items()},
            ),
        )
        payload = _model_dict(result)
        if not isinstance(payload.get("messages"), list):
            raise McpConnectionError("MCP prompts/get 返回无效结果")
        return payload

    async def call_tool(
        self,
        name: str,
        arguments: Mapping[str, Any],
    ) -> Mapping[str, Any]:
        result = await self._call(
            "tools/call",
            self._require_client().call_tool(name, dict(arguments)),
        )
        payload = _model_dict(result)
        if not isinstance(payload, Mapping):
            raise McpConnectionError("MCP tools/call 返回无效结果")
        return payload

    async def test(self) -> McpTestResult:
        await self.connect()
        tools = await self.list_tools()
        resources = await self.list_resources()
        resource_templates = await self.list_resource_templates()
        prompts = await self.list_prompts()
        return McpTestResult(
            server_name=self._server_name,
            server_version=self._server_version,
            tools=tuple(tool.name for tool in tools),
            resources=tuple(resource.uri for resource in resources),
            resource_templates=tuple(
                template.uri_template for template in resource_templates
            ),
            prompts=tuple(prompt.name for prompt in prompts),
            echo_output=None,
        )

    async def close(self) -> None:
        self._client = None
        await self._transport.close()

    def _require_client(self) -> SdkClient:
        if self._client is None:
            raise McpConnectionError("MCP Server 尚未连接")
        return self._client

    async def _list_all(
        self,
        fetch: Callable[..., Awaitable[Any]],
        result_key: str,
    ) -> tuple[Mapping[str, Any], ...]:
        items: list[Mapping[str, Any]] = []
        cursor: str | None = None
        seen_cursors: set[str] = set()
        for _page in range(_MAX_LIST_PAGES):
            result = await self._call(
                result_key,
                fetch(cursor=cursor),
            )
            payload = _model_dict(result)
            raw_items = payload.get(result_key)
            if not isinstance(raw_items, list):
                raise McpConnectionError(
                    f"MCP {result_key} 列表返回无效结果"
                )
            items.extend(
                item for item in raw_items if isinstance(item, Mapping)
            )
            if len(items) > _MAX_LIST_ITEMS:
                raise McpConnectionError(
                    f"MCP {result_key} 列表超过安全限制"
                )
            next_cursor = payload.get("nextCursor")
            if not isinstance(next_cursor, str) or not next_cursor:
                return tuple(items)
            if next_cursor in seen_cursors:
                raise McpConnectionError(
                    f"MCP {result_key} 分页游标重复"
                )
            seen_cursors.add(next_cursor)
            cursor = next_cursor
        raise McpConnectionError(f"MCP {result_key} 分页超过安全限制")

    async def _call(self, label: str, awaitable: Awaitable[Any]) -> Any:
        try:
            return await awaitable
        except asyncio.CancelledError:
            raise
        except McpConnectionError:
            raise
        except Exception as error:
            detail = _redact(
                str(error).strip() or type(error).__name__,
                self.config,
            )
            raise McpConnectionError(f"MCP {label} 失败：{detail}") from error

    def _transport_error(self, error: Exception) -> str:
        detail = str(error).strip() or type(error).__name__
        diagnostics = self._transport.diagnostics()
        if diagnostics and diagnostics not in detail:
            detail = f"{detail}\n{diagnostics}"
        return (
            f"无法连接 MCP Server：{self.config.name}："
            f"{_redact(detail, self.config)}"
        )


def _model_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, Mapping):
        return dict(value)
    model_dump = getattr(value, "model_dump", None)
    if callable(model_dump):
        dumped = model_dump(by_alias=True, exclude_none=True)
        if isinstance(dumped, Mapping):
            return dict(dumped)
    raise McpConnectionError("MCP SDK 返回了无法识别的结果")


def _redact(value: str, config: McpServerConfig) -> str:
    secrets = [config.credential, *config.environment.values()]
    for secret in secrets:
        if secret:
            value = value.replace(secret, "<redacted>")
    return value
