import json
import re
from collections.abc import Mapping
from typing import Any

from app.mcp.client import McpClient
from app.mcp.model import McpToolDefinition
from app.tool.base import FunctionTool, ToolCategory, ToolContext, ToolInput, ToolResult
from app.tool.json_schema import (
    validate_schema_definition,
    validate_schema_instance,
)


def create_mcp_tool(
    client: McpClient,
    definition: McpToolDefinition,
) -> FunctionTool:
    name = "mcp__" + _safe_name(client.config.server_id) + "__" + _safe_name(
        definition.name
    )
    # Server annotations are display hints, not a trust boundary. An MCP
    # server must never be able to grant itself approval bypass or automatic retry.
    read_only_hint = definition.annotations.get("readOnlyHint") is True
    destructive_hint = definition.annotations.get("destructiveHint") is True
    if definition.output_schema is not None:
        validate_schema_definition(definition.output_schema)

    async def execute(
        context: ToolContext,
        input_data: ToolInput,
    ) -> ToolResult:
        del context
        result = await client.call_tool(definition.name, input_data)
        contract_error = _validate_output(definition, result)
        if contract_error is not None:
            return ToolResult(
                content=f"MCP 工具返回值不符合声明：{contract_error}",
                is_error=True,
                metadata={
                    "mcpServerId": client.config.server_id,
                    "mcpServerName": client.config.name,
                    "mcpToolName": definition.name,
                    "failureKind": "mcp_output_schema_violation",
                    "retryable": False,
                    "mcpReadOnlyHint": read_only_hint,
                    "mcpDestructiveHint": destructive_hint,
                },
            )
        return ToolResult(
            content=_result_text(result),
            is_error=result.get("isError") is True,
            metadata={
                "mcpServerId": client.config.server_id,
                "mcpServerName": client.config.name,
                "mcpToolName": definition.name,
                "mcpReadOnlyHint": read_only_hint,
                "mcpDestructiveHint": destructive_hint,
            },
        )

    return FunctionTool(
        name=name,
        description=(
            f"[可选 MCP · {client.config.name}] "
            "仅当当前用户请求确实需要这个工具的具体能力时调用；"
            "Server 已连接不构成调用理由。"
            f"{definition.description}"
        ),
        input_schema=dict(definition.input_schema),
        executor=execute,
        category=ToolCategory.NETWORK,
        read_only=False,
        destructive=True,
        retry_safe=False,
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
            if not isinstance(item, Mapping):
                continue
            if item.get("type") == "text":
                parts.append(str(item.get("text") or ""))
            else:
                parts.append(json.dumps(dict(item), ensure_ascii=False))
    structured = result.get("structuredContent")
    if structured is not None:
        parts.append(json.dumps(structured, ensure_ascii=False))
    return "\n".join(part for part in parts if part) or "MCP 工具已完成"


def _validate_output(
    definition: McpToolDefinition,
    result: Mapping[str, Any],
) -> str | None:
    if definition.output_schema is None or result.get("isError") is True:
        return None
    if "structuredContent" not in result:
        return "声明了 outputSchema，但未返回 structuredContent"
    try:
        validate_schema_instance(
            definition.output_schema,
            result.get("structuredContent"),
        )
    except ValueError as error:
        return str(error)
    return None
