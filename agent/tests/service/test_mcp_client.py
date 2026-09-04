import asyncio
import json
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import httpx2
import pytest

from app.dto.request.mcp_request import McpServerRequest
from app.mcp.capability_adapter import create_mcp_capability_tools
from app.mcp.client import McpClient
from app.mcp.model import McpServerConfig, McpToolDefinition
from app.mcp.tool_adapter import create_mcp_tool
from app.mcp.transport import McpTransport, StreamableHttpMcpTransport
from app.tool.base import ToolContext
from app.tool.registry import ToolRegistry


def test_streamable_http_capabilities_and_static_bearer_auth() -> None:
    (
        result,
        resource,
        prompt,
        bridge_results,
        authorization_headers,
        called_methods,
    ) = asyncio.run(_round_trip())

    assert result.server_name == "test"
    assert result.tools == ("echo", "second")
    assert result.resources == ("lumora://test/welcome",)
    assert result.resource_templates == ("lumora://test/echo/{text}",)
    assert result.prompts == ("summarize_resource",)
    assert result.echo_output is None
    assert "tools/call" not in called_methods
    assert resource["contents"][0]["text"] == "Welcome to LUMORA MCP"
    assert prompt["messages"][0]["role"] == "user"
    assert "lumora://test/welcome" in bridge_results[0]
    assert "Welcome to LUMORA MCP" in bridge_results[1]
    assert "summarize_resource" in bridge_results[2]
    assert "Summarize lumora://test/welcome" in bridge_results[3]
    assert set(authorization_headers) == {"Bearer secret-token"}


def test_static_header_variants() -> None:
    assert McpServerConfig(
        "api",
        "API",
        "https://mcp.test",
        auth_type="api_key",
        header_name="X-API-Key",
        credential="secret",
    ).authentication_headers() == {"X-API-Key": "secret"}
    assert McpServerConfig(
        "custom",
        "Custom",
        "https://mcp.test",
        auth_type="custom_header",
        header_name="X-Workspace-Token",
        credential="token",
    ).authentication_headers() == {"X-Workspace-Token": "token"}


def test_stdio_request_accepts_windows_process_configuration() -> None:
    request = McpServerRequest.model_validate(
        {
            "serverId": "local-tools",
            "name": "Local tools",
            "transportType": "stdio",
            "command": "python.exe",
            "arguments": ["-m", "argument-secret"],
            "workingDirectory": "F:\\project\\local-tools",
            "environment": {"API_TOKEN": "secret"},
            "authType": "none",
        }
    )

    assert request.transport == "stdio"
    assert request.command == "python.exe"
    assert request.environment == {"API_TOKEN": "secret"}
    assert "secret" not in repr(request)
    assert "argument-secret" not in repr(request)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("command", "python.exe\r\ncalc.exe"),
        ("workingDirectory", "relative\\path"),
        ("environment", {"BAD-KEY": "value"}),
        ("environment", {"Path": "one", "PATH": "two"}),
    ],
)
def test_stdio_request_rejects_unsafe_process_configuration(
    field: str,
    value: object,
) -> None:
    payload: dict[str, object] = {
        "serverId": "local-tools",
        "name": "Local tools",
        "transportType": "stdio",
        "command": "python.exe",
        "authType": "none",
    }
    payload[field] = value

    with pytest.raises(ValueError):
        McpServerRequest.model_validate(payload)


def test_stdio_transport_runs_real_sdk_server(tmp_path: Path) -> None:
    server_file = tmp_path / "stdio_server.py"
    server_file.write_text(
        """
import os
from mcp.server import MCPServer

server = MCPServer("stdio-test", version="1.0.0")

@server.tool()
def read_configured_value() -> str:
    return os.environ.get("LUMORA_STDIO_TEST", "missing")

if __name__ == "__main__":
    server.run()
""".strip(),
        encoding="utf-8",
    )

    async def scenario() -> None:
        client = McpClient(
            McpServerConfig(
                server_id="stdio-test",
                name="stdio-test",
                url="",
                transport="stdio",
                command=sys.executable,
                arguments=(str(server_file),),
                working_directory=str(tmp_path),
                environment={"LUMORA_STDIO_TEST": "configured"},
            )
        )
        try:
            result = await client.test()
            assert result.server_name == "stdio-test"
            assert result.tools == ("read_configured_value",)
            called = await client.call_tool("read_configured_value", {})
            assert called["content"][0]["text"] == "configured"
        finally:
            await client.close()

    asyncio.run(scenario())


def test_transport_cancellation_releases_a_starting_connection() -> None:
    started = asyncio.Event()
    released = asyncio.Event()

    class HangingTransport(McpTransport):
        @asynccontextmanager
        async def _client_context(self):
            try:
                started.set()
                await asyncio.Event().wait()
                yield  # pragma: no cover
            finally:
                released.set()

    async def scenario() -> None:
        transport = HangingTransport()
        connection = asyncio.create_task(transport.connect())
        await started.wait()
        connection.cancel()
        with pytest.raises(asyncio.CancelledError):
            await connection
        assert released.is_set()
        await transport.close()

    asyncio.run(scenario())


def test_remote_annotations_do_not_bypass_approval_or_enable_retry() -> None:
    class StubClient:
        config = McpServerConfig("remote", "Remote", "https://mcp.test/mcp")

        async def call_tool(
            self,
            _name: str,
            _input: Any,
        ) -> dict[str, Any]:
            return {
                "structuredContent": {"status": "unexpected"},
                "content": [{"type": "image", "data": "encoded"}],
            }

    tool = create_mcp_tool(  # type: ignore[arg-type]
        StubClient(),
        McpToolDefinition(
            name="inspect",
            description="Inspect",
            input_schema={"type": "object", "properties": {}},
            annotations={"readOnlyHint": True, "destructiveHint": False},
            output_schema={
                "type": "object",
                "properties": {"status": {"enum": ["ok"]}},
                "required": ["status"],
            },
        ),
    )

    assert tool.is_read_only({}) is False
    assert tool.is_destructive({}) is True
    assert tool.is_retry_safe({}) is False
    result = asyncio.run(tool.execute(ToolContext(Path.cwd()), {}))
    assert result.is_error is True
    assert result.metadata["failureKind"] == "mcp_output_schema_violation"


async def _round_trip() -> tuple[
    Any,
    Any,
    Any,
    list[str],
    list[str],
    list[str],
]:
    authorization_headers: list[str] = []
    called_methods: list[str] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        authorization_headers.append(request.headers.get("authorization", ""))
        payload = json.loads(request.content)
        method = payload["method"]
        called_methods.append(method)
        if method == "server/discover":
            return httpx2.Response(
                200,
                json={
                    "jsonrpc": "2.0",
                    "id": payload.get("id"),
                    "error": {
                        "code": -32601,
                        "message": "Method not found",
                    },
                },
            )
        if method == "notifications/initialized":
            return httpx2.Response(202)
        result = _result_for(method, payload)
        return httpx2.Response(
            200,
            json={"jsonrpc": "2.0", "id": payload.get("id"), "result": result},
        )

    config = McpServerConfig(
        "remote",
        "Remote",
        "https://mcp.test/mcp",
        auth_type="bearer",
        credential="secret-token",
    )
    http_client = httpx2.AsyncClient(
        headers=config.authentication_headers(),
        transport=httpx2.MockTransport(handler),
    )
    client = McpClient(
        config,
        StreamableHttpMcpTransport(config, http_client=http_client),
    )
    try:
        result = await client.test()
        resource = await client.read_resource("lumora://test/welcome")
        prompt = await client.get_prompt(
            "summarize_resource",
            {"uri": "lumora://test/welcome"},
        )
        registry = ToolRegistry(create_mcp_capability_tools(client))
        context = ToolContext(Path.cwd())
        bridge_results = [
            (
                await registry.execute("mcpmeta__remote__resource_catalog", context, {})
            ).content,
            (
                await registry.execute(
                    "mcpmeta__remote__resource_read",
                    context,
                    {"uri": "lumora://test/welcome"},
                )
            ).content,
            (
                await registry.execute("mcpmeta__remote__prompt_catalog", context, {})
            ).content,
            (
                await registry.execute(
                    "mcpmeta__remote__prompt_get",
                    context,
                    {
                        "name": "summarize_resource",
                        "arguments": {"uri": "lumora://test/welcome"},
                    },
                )
            ).content,
        ]
    finally:
        await client.close()
        await http_client.aclose()

    return (
        result,
        resource,
        prompt,
        bridge_results,
        authorization_headers,
        called_methods,
    )


def _result_for(method: str, payload: dict[str, Any]) -> dict[str, Any]:
    if method == "initialize":
        return {
            "protocolVersion": "2025-11-25",
            "capabilities": {"tools": {}, "resources": {}, "prompts": {}},
            "serverInfo": {"name": "test", "version": "1"},
        }
    if method == "tools/list":
        if payload.get("params", {}).get("cursor") == "next-tools":
            return {
                "tools": [
                    {
                        "name": "second",
                        "description": "second page",
                        "inputSchema": {
                            "type": "object",
                            "properties": {},
                        },
                    }
                ]
            }
        return {
            "tools": [
                {
                    "name": "echo",
                    "description": "echo",
                    "inputSchema": {
                        "type": "object",
                        "properties": {"text": {"type": "string"}},
                        "required": ["text"],
                    },
                    "annotations": {"readOnlyHint": True},
                }
            ],
            "nextCursor": "next-tools",
        }
    if method == "tools/call":
        return {
            "content": [
                {
                    "type": "text",
                    "text": payload["params"]["arguments"]["text"],
                }
            ],
            "isError": False,
        }
    if method == "resources/list":
        return {
            "resources": [
                {
                    "uri": "lumora://test/welcome",
                    "name": "welcome",
                    "mimeType": "text/plain",
                }
            ]
        }
    if method == "resources/templates/list":
        return {
            "resourceTemplates": [
                {
                    "uriTemplate": "lumora://test/echo/{text}",
                    "name": "echo-resource",
                }
            ]
        }
    if method == "resources/read":
        return {
            "contents": [
                {
                    "uri": payload["params"]["uri"],
                    "mimeType": "text/plain",
                    "text": "Welcome to LUMORA MCP",
                }
            ]
        }
    if method == "prompts/list":
        return {
            "prompts": [
                {
                    "name": "summarize_resource",
                    "arguments": [{"name": "uri", "required": True}],
                }
            ]
        }
    if method == "prompts/get":
        return {
            "messages": [
                {
                    "role": "user",
                    "content": {
                        "type": "text",
                        "text": f"Summarize {payload['params']['arguments']['uri']}",
                    },
                }
            ]
        }
    raise AssertionError(f"Unexpected MCP method: {method}")
