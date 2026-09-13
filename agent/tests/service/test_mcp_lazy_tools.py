import asyncio
import json
from pathlib import Path
from typing import Any

from app.dto.request.chat_completion_request import ChatMessageRequest
from app.dto.response.chat_completion_response import TokenUsageResponse
from app.harness.agent_loop import AgentLoopRunner
from app.harness.contracts import ProviderToolCall, ProviderTurn
from app.mcp.lazy_tools import MCP_TOOL_SEARCH_NAME, McpDeferredToolStore
from app.mcp.model import McpServerConfig, McpToolDefinition
from app.mcp.tool_adapter import create_mcp_tool
from app.model.model_connection_settings import ModelConnectionSettings
from app.permission.model import PermissionMode, PermissionPolicy
from app.prompt.prompt_builder import PromptBuilder
from app.prompt.prompt_context import PromptContext
from app.prompt.runtime_reminder import RuntimeReminderStore
from app.tool.base import ToolContext, ToolResult, function_tool
from app.tool.registry import ToolRegistry


class _StubMcpClient:
    config = McpServerConfig(
        "remote",
        "Remote",
        "https://mcp.test/mcp",
    )

    async def call_tool(
        self,
        _name: str,
        _input: Any,
    ) -> dict[str, Any]:
        return {"content": [{"type": "text", "text": "ok"}]}


def _mcp_tool() -> Any:
    return create_mcp_tool(
        _StubMcpClient(),
        McpToolDefinition(
            name="echo",
            description="Return text unchanged",
            input_schema={
                "type": "object",
                "properties": {"text": {"type": "string"}},
                "required": ["text"],
                "additionalProperties": False,
            },
            annotations={},
        ),
    )


def test_deferred_mcp_tool_is_not_registered_until_search() -> None:
    store = McpDeferredToolStore()
    tool = _mcp_tool()
    assert store.add(
        tool,
        server_name="Remote",
        remote_name="echo",
    ) is True

    registry = ToolRegistry()
    store.bind_registry(registry)
    registry.register(store.create_search_tool())

    assert registry.names() == (MCP_TOOL_SEARCH_NAME,)
    assert "mcp__remote__echo" in store.reminders()[0]

    result = asyncio.run(registry.execute(
        MCP_TOOL_SEARCH_NAME,
        ToolContext(Path.cwd()),
        {"query": "select:mcp__remote__echo"},
    ))

    payload = json.loads(result.content)
    assert payload["loadedTools"] == ["mcp__remote__echo"]
    assert payload["tools"][0]["function"]["name"] == "mcp__remote__echo"
    assert registry.names() == (
        MCP_TOOL_SEARCH_NAME,
        "mcp__remote__echo",
    )
    assert store.reminders() == ()


def test_loaded_mcp_tool_expires_and_can_be_searched_again() -> None:
    store = McpDeferredToolStore(idle_rounds=2)
    tool = _mcp_tool()
    store.add(tool, server_name="Remote", remote_name="echo")
    registry = ToolRegistry()
    store.bind_registry(registry)
    registry.register(store.create_search_tool())

    store.begin_turn(0)
    asyncio.run(registry.execute(
        MCP_TOOL_SEARCH_NAME,
        ToolContext(Path.cwd()),
        {"query": "select:mcp__remote__echo"},
    ))
    assert "mcp__remote__echo" in registry.names()
    assert store.expire_unused(1) == ()
    assert "mcp__remote__echo" in registry.names()

    assert store.expire_unused(2) == ("mcp__remote__echo",)
    assert "mcp__remote__echo" not in registry.names()
    assert "mcp__remote__echo" in store.reminders()[0]

    asyncio.run(registry.execute(
        MCP_TOOL_SEARCH_NAME,
        ToolContext(Path.cwd()),
        {"query": "select:mcp__remote__echo"},
    ))
    assert "mcp__remote__echo" in registry.names()


def test_runtime_reminder_store_notifies_only_real_changes() -> None:
    store = RuntimeReminderStore()
    changes = []
    unsubscribe = store.subscribe(changes.append)

    assert store.upsert("phase", "当前阶段：验证") is True
    assert store.upsert("phase", "当前阶段：验证") is False
    assert store.upsert("phase", "当前阶段：实现") is True
    assert store.remove("phase") is True
    unsubscribe()
    assert store.upsert("after", "不会通知已取消的监听器") is True

    assert [(change.action, change.key) for change in changes] == [
        ("upsert", "phase"),
        ("upsert", "phase"),
        ("remove", "phase"),
    ]


def test_tool_search_refreshes_prompt_tools_for_the_next_model_turn(
    tmp_path: Path,
) -> None:
    store = McpDeferredToolStore()
    tool = _mcp_tool()
    store.add(tool, server_name="Remote", remote_name="echo")
    registry = ToolRegistry()
    store.bind_registry(registry)
    registry.register(store.create_search_tool())
    builder = PromptBuilder()
    seen_tool_names: list[tuple[str, ...]] = []
    turn_number = 0

    def build_prompt(_summary: str | None = None):
        names = registry.names()
        mcp_names = tuple(name for name in names if name.startswith("mcp__"))
        return builder.build(PromptContext(
            available_tools=names,
            mcp_tool_names=mcp_names,
            system_reminders=store.reminders(),
            tool_definitions=registry.model_definitions(names),
        ))

    async def complete_turn(*args: Any) -> ProviderTurn:
        nonlocal turn_number
        turn_number += 1
        tools = args[2]
        seen_tool_names.append(tuple(
            definition["function"]["name"] for definition in tools
        ))
        calls = (
            (
                ProviderToolCall(
                    "search-1",
                    MCP_TOOL_SEARCH_NAME,
                    '{"query":"select:mcp__remote__echo"}',
                ),
            )
            if turn_number == 1
            else (
                (
                    ProviderToolCall(
                        "echo-1",
                        "mcp__remote__echo",
                        '{"text":"hello"}',
                    ),
                )
                if turn_number == 2
                else ()
            )
        )
        return ProviderTurn(
            content="继续处理" if calls else "完成",
            reasoning="",
            model="test-model",
            usage=TokenUsageResponse(
                promptTokens=10,
                completionTokens=2,
                totalTokens=12,
            ),
            tool_calls=calls,
        )

    async def scenario() -> list[Any]:
        return [
            event
            async for event in AgentLoopRunner(
                complete_turn,
                prompt_supplier=build_prompt,
            ).stream(
                ModelConnectionSettings(
                    provider_name="test",
                    base_url="https://example.com/v1",
                    model="test-model",
                    api_key="secret",
                ),
                build_prompt(),
                [ChatMessageRequest(role="user", content="调用 MCP echo")],
                None,
                registry,
                ToolContext(tmp_path),
                PermissionPolicy(mode=PermissionMode.FULL_ACCESS),
            )
        ]

    events = asyncio.run(scenario())

    assert seen_tool_names[0] == (MCP_TOOL_SEARCH_NAME,)
    assert "mcp__remote__echo" not in seen_tool_names[0]
    assert "mcp__remote__echo" in seen_tool_names[1]
    assert any(event.type == "completed" for event in events)


def test_runtime_reminder_refreshes_for_the_next_model_turn(
    tmp_path: Path,
) -> None:
    store = RuntimeReminderStore()
    registry = ToolRegistry()

    async def update_state(
        context: ToolContext,
        input_data: Any,
    ) -> ToolResult:
        assert context.reminder_store is not None
        context.reminder_store.upsert("phase", input_data["message"])
        return ToolResult("状态已更新")

    registry.register(function_tool(
        name="update_runtime_state",
        description="更新运行时状态",
        input_schema={
            "type": "object",
            "properties": {"message": {"type": "string"}},
            "required": ["message"],
            "additionalProperties": False,
        },
        execute=update_state,
        read_only=True,
        retry_safe=True,
    ))
    builder = PromptBuilder()
    seen_messages: list[list[dict[str, Any]]] = []
    turn_number = 0

    def build_prompt(_summary: str | None = None):
        names = registry.names()
        return builder.build(PromptContext(
            available_tools=names,
            system_reminders=store.snapshot(),
            tool_definitions=registry.model_definitions(names),
        ))

    async def complete_turn(*args: Any) -> ProviderTurn:
        nonlocal turn_number
        turn_number += 1
        seen_messages.append(list(args[1]))
        calls = (
            (
                ProviderToolCall(
                    "state-1",
                    "update_runtime_state",
                    '{"message":"当前阶段：验证"}',
                ),
            )
            if turn_number == 1
            else ()
        )
        return ProviderTurn(
            content="继续处理" if calls else "完成",
            reasoning="",
            model="test-model",
            usage=TokenUsageResponse(
                promptTokens=10,
                completionTokens=2,
                totalTokens=12,
            ),
            tool_calls=calls,
        )

    async def scenario() -> list[Any]:
        return [
            event
            async for event in AgentLoopRunner(
                complete_turn,
                prompt_supplier=build_prompt,
            ).stream(
                ModelConnectionSettings(
                    provider_name="test",
                    base_url="https://example.com/v1",
                    model="test-model",
                    api_key="secret",
                ),
                build_prompt(),
                [ChatMessageRequest(role="user", content="更新状态")],
                None,
                registry,
                ToolContext(tmp_path, reminder_store=store),
                PermissionPolicy(mode=PermissionMode.FULL_ACCESS),
            )
        ]

    events = asyncio.run(scenario())

    assert "当前阶段：验证" not in str(seen_messages[0])
    assert "当前阶段：验证" in str(seen_messages[1])
    assert any(event.type == "completed" for event in events)
