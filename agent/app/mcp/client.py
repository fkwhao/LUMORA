import asyncio
import json
from collections.abc import Mapping
from typing import Any

import httpx

from app.mcp.model import (
    McpPromptArgument,
    McpPromptDefinition,
    McpResourceDefinition,
    McpResourceTemplateDefinition,
    McpServerConfig,
    McpTestResult,
    McpToolDefinition,
)

_PROTOCOL_VERSION = "2025-11-25"


class McpConnectionError(OSError):
    pass


class McpClient:
    """MCP client for Tools, Resources and Prompts over Streamable HTTP."""

    def __init__(
        self,
        config: McpServerConfig,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self.config = config
        self._http = http_client
        self._session_id: str | None = None
        self._next_request_id = 1
        self._lock = asyncio.Lock()
        self._server_name = config.name
        self._server_version = ""
        self._server_capabilities: dict[str, Any] = {}

    async def connect(self) -> None:
        if self._http is None:
            self._http = httpx.AsyncClient(timeout=15.0, follow_redirects=False)
        result = await self._request(
            "initialize",
            {
                "protocolVersion": _PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": {"name": "LUMORA", "version": "0.1.0"},
            },
        )
        if not isinstance(result, Mapping):
            raise McpConnectionError("MCP initialize 返回无效结果")
        server_info = result.get("serverInfo")
        if isinstance(server_info, Mapping):
            self._server_name = str(server_info.get("name") or self.config.name)
            self._server_version = str(server_info.get("version") or "")
        capabilities = result.get("capabilities")
        if isinstance(capabilities, Mapping):
            self._server_capabilities = dict(capabilities)
        await self._notify("notifications/initialized", {})

    def supports(self, capability: str) -> bool:
        return capability in self._server_capabilities

    async def list_tools(self) -> tuple[McpToolDefinition, ...]:
        if not self.supports("tools"):
            return ()
        result = await self._request("tools/list", {})
        if not isinstance(result, Mapping) or not isinstance(result.get("tools"), list):
            raise McpConnectionError("MCP tools/list 返回无效结果")
        tools: list[McpToolDefinition] = []
        for raw in result["tools"]:
            if not isinstance(raw, Mapping) or not str(raw.get("name") or "").strip():
                continue
            schema = raw.get("inputSchema")
            annotations = raw.get("annotations")
            tools.append(
                McpToolDefinition(
                    name=str(raw["name"]),
                    description=str(raw.get("description") or "MCP tool"),
                    input_schema=(
                        dict(schema)
                        if isinstance(schema, Mapping)
                        else {"type": "object", "properties": {}}
                    ),
                    annotations=(
                        dict(annotations) if isinstance(annotations, Mapping) else {}
                    ),
                )
            )
        return tuple(tools)

    async def list_resources(self) -> tuple[McpResourceDefinition, ...]:
        if not self.supports("resources"):
            return ()
        raw_items = await self._list_all("resources/list", "resources")
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
            "resources/templates/list",
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
        result = await self._request("resources/read", {"uri": uri})
        if not isinstance(result, Mapping) or not isinstance(
            result.get("contents"), list
        ):
            raise McpConnectionError("MCP resources/read 返回无效结果")
        return result

    async def list_prompts(self) -> tuple[McpPromptDefinition, ...]:
        if not self.supports("prompts"):
            return ()
        raw_items = await self._list_all("prompts/list", "prompts")
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
                    argument_name = str(raw_argument.get("name") or "").strip()
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
        result = await self._request(
            "prompts/get",
            {"name": name, "arguments": dict(arguments)},
        )
        if not isinstance(result, Mapping) or not isinstance(
            result.get("messages"), list
        ):
            raise McpConnectionError("MCP prompts/get 返回无效结果")
        return result

    async def call_tool(
        self,
        name: str,
        arguments: Mapping[str, Any],
    ) -> Mapping[str, Any]:
        result = await self._request(
            "tools/call",
            {"name": name, "arguments": dict(arguments)},
        )
        if not isinstance(result, Mapping):
            raise McpConnectionError("MCP tools/call 返回无效结果")
        return result

    async def test(self) -> McpTestResult:
        await self.connect()
        tools = await self.list_tools()
        resources = await self.list_resources()
        resource_templates = await self.list_resource_templates()
        prompts = await self.list_prompts()
        echo_output: str | None = None
        echo = next((tool for tool in tools if tool.name == "echo"), None)
        if echo is not None:
            result = await self.call_tool("echo", {"text": "LUMORA MCP connected"})
            echo_output = _content_text(result)
        return McpTestResult(
            server_name=self._server_name,
            server_version=self._server_version,
            tools=tuple(tool.name for tool in tools),
            resources=tuple(resource.uri for resource in resources),
            resource_templates=tuple(
                template.uri_template for template in resource_templates
            ),
            prompts=tuple(prompt.name for prompt in prompts),
            echo_output=echo_output,
        )

    async def close(self) -> None:
        if self._http is not None:
            await self._http.aclose()
            self._http = None

    async def _request(
        self,
        method: str,
        params: Mapping[str, Any],
    ) -> Any:
        async with self._lock:
            request_id = self._next_request_id
            self._next_request_id += 1
            message = {
                "jsonrpc": "2.0",
                "id": request_id,
                "method": method,
                "params": dict(params),
            }
            response = await self._exchange(message, expect_response=True)
            if not isinstance(response, Mapping):
                raise McpConnectionError("MCP Server 返回空响应")
            if response.get("error") is not None:
                error = response["error"]
                detail = error.get("message") if isinstance(error, Mapping) else error
                raise McpConnectionError(f"MCP 调用失败：{detail}")
            if response.get("id") != request_id:
                raise McpConnectionError("MCP 响应 ID 不匹配")
            return response.get("result")

    async def _notify(self, method: str, params: Mapping[str, Any]) -> None:
        message = {"jsonrpc": "2.0", "method": method, "params": dict(params)}
        await self._exchange(message, expect_response=False)

    async def _list_all(
        self,
        method: str,
        result_key: str,
    ) -> tuple[Mapping[str, Any], ...]:
        items: list[Mapping[str, Any]] = []
        cursor: str | None = None
        for _page in range(100):
            params = {"cursor": cursor} if cursor else {}
            result = await self._request(method, params)
            if not isinstance(result, Mapping) or not isinstance(
                result.get(result_key), list
            ):
                raise McpConnectionError(f"MCP {method} 返回无效结果")
            items.extend(
                item for item in result[result_key] if isinstance(item, Mapping)
            )
            next_cursor = result.get("nextCursor")
            if not isinstance(next_cursor, str) or not next_cursor:
                return tuple(items)
            cursor = next_cursor
        raise McpConnectionError(f"MCP {method} 分页超过安全限制")

    async def _exchange(
        self,
        message: Mapping[str, Any],
        *,
        expect_response: bool,
    ) -> Mapping[str, Any] | None:
        return await self._exchange_http(message, expect_response=expect_response)

    async def _exchange_http(
        self,
        message: Mapping[str, Any],
        *,
        expect_response: bool,
    ) -> Mapping[str, Any] | None:
        if self._http is None:
            raise McpConnectionError("Streamable HTTP MCP Server 尚未连接")
        headers = {
            "Accept": "application/json, text/event-stream",
            "Content-Type": "application/json",
            "MCP-Protocol-Version": _PROTOCOL_VERSION,
        }
        headers.update(self.config.authentication_headers())
        if self._session_id:
            headers["MCP-Session-Id"] = self._session_id
        try:
            response = await self._http.post(
                self.config.url,
                headers=headers,
                json=dict(message),
            )
        except httpx.HTTPError as error:
            raise McpConnectionError(f"无法连接 MCP Server：{self.config.name}") from error
        if response.status_code >= 400:
            raise McpConnectionError(
                f"MCP Server 返回 HTTP {response.status_code}"
            )
        session_id = response.headers.get("MCP-Session-Id")
        if session_id:
            self._session_id = session_id
        if not expect_response or response.status_code == 202:
            return None
        content_type = response.headers.get("content-type", "").lower()
        try:
            if "text/event-stream" in content_type:
                return _parse_sse_response(response.text, message.get("id"))
            payload = response.json()
        except (json.JSONDecodeError, ValueError) as error:
            raise McpConnectionError("MCP Server 返回了无效 JSON") from error
        return payload if isinstance(payload, Mapping) else None


def _parse_sse_response(text: str, request_id: Any) -> Mapping[str, Any] | None:
    for line in text.splitlines():
        if not line.startswith("data:"):
            continue
        try:
            payload = json.loads(line[5:].strip())
        except json.JSONDecodeError:
            continue
        if isinstance(payload, Mapping) and payload.get("id") == request_id:
            return payload
    return None


def _content_text(result: Mapping[str, Any]) -> str:
    parts: list[str] = []
    content = result.get("content")
    if isinstance(content, list):
        for item in content:
            if isinstance(item, Mapping) and item.get("type") == "text":
                parts.append(str(item.get("text") or ""))
    if parts:
        return "\n".join(parts)
    structured = result.get("structuredContent")
    return json.dumps(structured, ensure_ascii=False) if structured is not None else ""
