import asyncio
import json
from pathlib import Path
from typing import Any

import httpx

from app.mcp.capability_adapter import create_mcp_capability_tools
from app.mcp.client import McpClient
from app.mcp.model import McpServerConfig
from app.tool.base import ToolContext
from app.tool.registry import ToolRegistry


def test_streamable_http_capabilities_and_static_bearer_auth() -> None:
    result, resource, prompt, bridge_results, authorization_headers = asyncio.run(
        _round_trip()
    )

    assert result.server_name == "test"
    assert result.tools == ("echo",)
    assert result.resources == ("lumora://test/welcome",)
    assert result.resource_templates == ("lumora://test/echo/{text}",)
    assert result.prompts == ("summarize_resource",)
    assert result.echo_output == "LUMORA MCP connected"
    assert resource["contents"][0]["text"] == "Welcome to LUMORA MCP"
    assert prompt["messages"][0]["role"] == "user"
    assert "lumora://test/welcome" in bridge_results[0]
    assert "Welcome to LUMORA MCP" in bridge_results[1]
    assert "summarize_resource" in bridge_results[2]
    assert "Summarize lumora://test/welcome" in bridge_results[3]
    assert set(authorization_headers) == {"Bearer secret-token"}


def test_static_header_variants() -> None:
    assert McpServerConfig(
        "api", "API", "https://mcp.test", auth_type="api_key",
        header_name="X-API-Key", credential="secret",
    ).authentication_headers() == {"X-API-Key": "secret"}
    assert McpServerConfig(
        "custom", "Custom", "https://mcp.test", auth_type="custom_header",
        header_name="X-Workspace-Token", credential="token",
    ).authentication_headers() == {"X-Workspace-Token": "token"}


async def _round_trip() -> tuple[Any, Any, Any, list[str], list[str]]:
    authorization_headers: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        authorization_headers.append(request.headers.get("authorization", ""))
        payload = json.loads(request.content)
        method = payload["method"]
        if method == "notifications/initialized":
            return httpx.Response(202)
        result = _result_for(method, payload)
        return httpx.Response(
            200,
            json={"jsonrpc": "2.0", "id": payload.get("id"), "result": result},
        )

    client = McpClient(
        McpServerConfig(
            "remote",
            "Remote",
            "https://mcp.test/mcp",
            auth_type="bearer",
            credential="secret-token",
        ),
        httpx.AsyncClient(transport=httpx.MockTransport(handler)),
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
                await registry.execute(
                    "mcpmeta__remote__resource_catalog", context, {}
                )
            ).content,
            (
                await registry.execute(
                    "mcpmeta__remote__resource_read",
                    context,
                    {"uri": "lumora://test/welcome"},
                )
            ).content,
            (
                await registry.execute(
                    "mcpmeta__remote__prompt_catalog", context, {}
                )
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

    return result, resource, prompt, bridge_results, authorization_headers


def _result_for(method: str, payload: dict[str, Any]) -> dict[str, Any]:
    if method == "initialize":
        return {
            "protocolVersion": "2025-11-25",
            "capabilities": {"tools": {}, "resources": {}, "prompts": {}},
            "serverInfo": {"name": "test", "version": "1"},
        }
    if method == "tools/list":
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
            ]
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
