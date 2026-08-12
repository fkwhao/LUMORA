import json
import re
from collections.abc import Mapping
from typing import Any

from app.mcp.client import McpClient
from app.mcp.model import McpToolDefinition
from app.tool.base import FunctionTool, ToolCategory, ToolContext, ToolInput, ToolResult


def create_mcp_tool(
    client: McpClient,
    definition: McpToolDefinition,
) -> FunctionTool:
    name = "mcp__" + _safe_name(client.config.server_id) + "__" + _safe_name(
        definition.name
    )
    read_only = definition.annotations.get("readOnlyHint") is True
    # MCP annotations are server-provided hints. Anything not explicitly
    # read-only must still enter LUMORA's normal approval flow.
    destructive = (
        not read_only
        or definition.annotations.get("destructiveHint") is True
    )

    async def execute(
        context: ToolContext,
        input_data: ToolInput,
    ) -> ToolResult:
        del context
        result = await client.call_tool(definition.name, input_data)
        return ToolResult(
            content=_result_text(result),
            is_error=result.get("isError") is True,
            metadata={
                "mcpServerId": client.config.server_id,
                "mcpServerName": client.config.name,
                "mcpToolName": definition.name,
            },
        )

    return FunctionTool(
        name=name,
        description=(
            f"[可选 MCP · {client.config.name}] "
            "仅当当前用户请求确实需要这个工具的具体远程能力时调用；"
            "Server 已连接不构成调用理由。"
            f"{definition.description}"
        ),
        input_schema=dict(definition.input_schema),
        executor=execute,
        category=ToolCategory.NETWORK,
        read_only=read_only,
        destructive=destructive,
        concurrency_safe=False,
        title_factory=lambda _input: f"调用 {client.config.name} · {definition.name}",
    )


def _safe_name(value: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9_-]+", "_", value.strip())
    return normalized.strip("_") or "tool"


def _result_text(result: Mapping[str, Any]) -> str:
    parts: list[str] = []
    content = result.get("content")
    if isinstance(content, list):
        for item in content:
            if isinstance(item, Mapping) and item.get("type") == "text":
                parts.append(str(item.get("text") or ""))
    structured = result.get("structuredContent")
    if structured is not None:
        parts.append(json.dumps(structured, ensure_ascii=False))
    return "\n".join(part for part in parts if part) or "MCP 工具已完成"
