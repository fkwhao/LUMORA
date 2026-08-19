import asyncio
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from app.execution.tool_call_executor import ToolCallExecutor
from app.execution.tool_result_processor import ToolResultProcessor
from app.harness.contracts import ProviderToolCall
from app.harness.run_control import RunControl
from app.harness.run_event import RunEvent, RunUsage
from app.model.model_connection_settings import ModelConnectionSettings
from app.permission.broker import ApprovalBroker
from app.permission.config_store import PermissionConfigStore
from app.permission.engine import PermissionEngine
from app.permission.model import PermissionMode, PermissionPolicy
from app.prompt.prompt_builder import PromptBuilder
from app.subagent.runtime import (
    SubagentRuntime,
    _SubagentRunControl,
    create_delegate_task_tool,
)
from app.tool.base import ToolCategory, ToolContext, ToolResult, function_tool
from app.tool.default_registry import create_default_tool_registry
from app.tool.registry import ToolRegistry


class ChildHarness:
    def __init__(self) -> None:
        self.messages: Any = None
        self.registry: Any = None
        self.prompt: Any = None
        self.context: Any = None
        self.permission_policy: Any = None

    async def stream(
        self,
        _settings: Any,
        prompt: Any,
        messages: Any,
        _reasoning_effort: Any,
        registry: Any,
        *_args: Any,
    ) -> AsyncIterator[RunEvent]:
        self.messages = messages
        self.registry = registry
        self.prompt = prompt
        self.context = _args[0]
        self.permission_policy = _args[1]
        yield RunEvent(
            type="progress_message",
            item_id="progress-1",
            title="检查入口",
            delta="正在定位相关代码",
        )
        yield RunEvent(type="text_delta", delta="找到入口。")
        yield RunEvent(
            type="usage",
            model="example-model",
            usage=RunUsage(
                prompt_tokens=30,
                completion_tokens=8,
                total_tokens=38,
            ),
        )
        yield RunEvent(type="completed", model="example-model")


def test_child_run_control_never_consumes_parent_steers() -> None:
    parent = RunControl()
    parent.add_steer("steer-1", "补充问题")
    child = _SubagentRunControl(parent)

    assert child.claim_steers() == ()
    assert child.close_and_claim_steers() == ()
    assert [steer.input_id for steer in parent.claim_steers()] == ["steer-1"]
    assert parent.request_pause() is True
    assert child.pause_requested is True


def test_subagent_uses_isolated_messages_and_emits_observable_lifecycle(
    tmp_path: Path,
) -> None:
    harness = ChildHarness()
    runtime = SubagentRuntime(
        harness=harness,  # type: ignore[arg-type]
        settings=ModelConnectionSettings(
            provider_name="test",
            base_url="https://example.com/v1",
            api_key="secret",
            model="example-model",
        ),
        reasoning_effort=None,
        source_registry=create_default_tool_registry(),
        prompt_builder=PromptBuilder(),
        project_instructions=("遵守项目约束",),
        permission_engine=PermissionEngine(),
        approval_broker=ApprovalBroker(),
        permission_config_store=PermissionConfigStore(tmp_path / "home"),
        permission_policy=PermissionPolicy(
            mode=PermissionMode.REQUEST_APPROVAL
        ),
        run_control=None,
    )
    emitted: list[RunEvent] = []

    async def emit(event: RunEvent) -> None:
        emitted.append(event)

    async def run():
        return await runtime.run(
            ToolContext(
                workspace_path=tmp_path,
                correlation_id="run-1",
                task_id="task-1",
                emit_event=emit,
            ),
            description="检查架构",
            prompt="只检查架构入口并报告证据",
        )

    result = asyncio.run(run())

    assert result.content == "找到入口。"
    assert [event.type for event in emitted] == [
        "agent_started",
        "agent_event",
        "usage",
        "agent_completed",
    ]
    assert emitted[1].metadata["childEventType"] == "progress_message"
    assert emitted[2].metadata["usageDelta"] is True
    assert emitted[3].output == "找到入口。"
    assert emitted[0].metadata["sessionId"].startswith("run-1:agent:")
    assert len(harness.messages) == 1
    assert harness.messages[0].content == "只检查架构入口并报告证据"
    assert {
        "read_file",
        "write_file",
        "apply_patch",
        "shell_command",
        "delegate_task",
    }.issubset(harness.registry.names())
    assert "write_file" in str(harness.prompt.tools)
    assert "shell_command" in str(harness.prompt.tools)
    assert "实际暴露的工具表" in harness.prompt.system_prompt
    assert "前台 one-shot 调用" in harness.prompt.system_prompt
    assert harness.context.correlation_id == "run-1"
    assert harness.context.session_id.startswith("run-1:agent:")
    assert harness.context.agent_id == emitted[0].metadata["agentId"]
    assert harness.context.delegation_depth == 1
    assert (
        harness.permission_policy.mode is PermissionMode.REQUEST_APPROVAL
    )


def test_delegate_tool_is_control_plane_and_parallel_safe(tmp_path: Path) -> None:
    runtime = SubagentRuntime(
        harness=ChildHarness(),  # type: ignore[arg-type]
        settings=ModelConnectionSettings(
            provider_name="test",
            base_url="https://example.com/v1",
            api_key="secret",
            model="model",
        ),
        reasoning_effort=None,
        source_registry=create_default_tool_registry(),
        prompt_builder=PromptBuilder(),
        project_instructions=(),
        permission_engine=PermissionEngine(),
        approval_broker=ApprovalBroker(),
        permission_config_store=PermissionConfigStore(tmp_path / "home"),
        permission_policy=PermissionPolicy(mode=PermissionMode.FULL_ACCESS),
        run_control=None,
    )
    tool = create_delegate_task_tool(runtime)
    payload = {"description": "研究", "prompt": "返回结论"}

    assert tool.is_read_only(payload) is True
    assert tool.is_concurrency_safe(payload) is True
    assert tool.validate_input(payload) is None
    assert "前台 one-shot" in tool.description
    assert "实际可见的工具" in tool.description


def test_unscoped_subagent_does_not_regain_workspace_file_tools(
    tmp_path: Path,
) -> None:
    harness = ChildHarness()
    runtime = SubagentRuntime(
        harness=harness,  # type: ignore[arg-type]
        settings=ModelConnectionSettings(
            provider_name="test",
            base_url="https://example.com/v1",
            api_key="secret",
            model="model",
        ),
        reasoning_effort=None,
        source_registry=create_default_tool_registry(),
        prompt_builder=PromptBuilder(),
        project_instructions=(),
        permission_engine=PermissionEngine(),
        approval_broker=ApprovalBroker(),
        permission_config_store=PermissionConfigStore(tmp_path / "home"),
        permission_policy=PermissionPolicy(mode=PermissionMode.FULL_ACCESS),
        run_control=None,
    )

    asyncio.run(runtime.run(
        ToolContext(
            workspace_path=tmp_path,
            workspace_scoped=False,
            correlation_id="run-unscoped",
        ),
        description="概念研究",
        prompt="解释一个概念",
    ))

    assert "delegate_task" in harness.registry.names()
    assert "read_file" not in str(harness.prompt.tools)
    assert "shell_command" not in str(harness.prompt.tools)


def test_subagent_inherits_request_visible_mcp_and_mutating_tools(
    tmp_path: Path,
) -> None:
    harness = ChildHarness()

    async def mcp_lookup(
        _context: ToolContext,
        _input: Any,
    ) -> ToolResult:
        return ToolResult("mcp-result")

    registry = create_default_tool_registry()
    registry.register(function_tool(
        name="mcp_lookup",
        description="查询测试 MCP",
        input_schema={"type": "object", "properties": {}},
        execute=mcp_lookup,
        category=ToolCategory.NETWORK,
        read_only=True,
        concurrency_safe=True,
    ))
    runtime = SubagentRuntime(
        harness=harness,  # type: ignore[arg-type]
        settings=ModelConnectionSettings(
            provider_name="test",
            base_url="https://example.com/v1",
            api_key="secret",
            model="model",
        ),
        reasoning_effort=None,
        source_registry=registry,
        prompt_builder=PromptBuilder(),
        project_instructions=(),
        permission_engine=PermissionEngine(),
        approval_broker=ApprovalBroker(),
        permission_config_store=PermissionConfigStore(tmp_path / "home"),
        permission_policy=PermissionPolicy(
            mode=PermissionMode.REQUEST_APPROVAL
        ),
        run_control=None,
    )
    runtime.bind_allowed_tools((
        "read_file",
        "write_file",
        "shell_command",
        "mcp_lookup",
        "delegate_task",
    ))

    asyncio.run(runtime.run(
        ToolContext(
            workspace_path=tmp_path,
            correlation_id="run-capabilities",
        ),
        description="实现功能",
        prompt="修改文件、运行测试并查询 MCP",
    ))

    assert set(harness.registry.names()) == {
        "read_file",
        "write_file",
        "shell_command",
        "mcp_lookup",
        "delegate_task",
    }


def test_max_depth_agent_cannot_delegate_again(tmp_path: Path) -> None:
    harness = ChildHarness()
    runtime = SubagentRuntime(
        harness=harness,  # type: ignore[arg-type]
        settings=ModelConnectionSettings(
            provider_name="test",
            base_url="https://example.com/v1",
            api_key="secret",
            model="model",
        ),
        reasoning_effort=None,
        source_registry=create_default_tool_registry(),
        prompt_builder=PromptBuilder(),
        project_instructions=(),
        permission_engine=PermissionEngine(),
        approval_broker=ApprovalBroker(),
        permission_config_store=PermissionConfigStore(tmp_path / "home"),
        permission_policy=PermissionPolicy(mode=PermissionMode.FULL_ACCESS),
        run_control=None,
        max_delegation_depth=3,
    )

    asyncio.run(runtime.run(
        ToolContext(
            workspace_path=tmp_path,
            correlation_id="run-depth",
            agent_id="parent-agent",
            delegation_depth=2,
        ),
        description="末级 Agent",
        prompt="完成任务",
    ))

    assert harness.context.delegation_depth == 3
    assert "delegate_task" not in harness.registry.names()


def test_nested_agent_lifecycle_keeps_its_own_identity(tmp_path: Path) -> None:
    class NestedLifecycleHarness(ChildHarness):
        async def stream(self, *args: Any) -> AsyncIterator[RunEvent]:
            async for event in super().stream(*args):
                if event.type == "progress_message":
                    yield RunEvent(
                        type="agent_started",
                        item_id="grandchild",
                        title="孙级 Agent",
                        metadata={
                            "agentId": "grandchild",
                            "parentAgentId": "child-agent",
                            "delegationDepth": 2,
                        },
                    )
                yield event

    harness = NestedLifecycleHarness()
    runtime = SubagentRuntime(
        harness=harness,  # type: ignore[arg-type]
        settings=ModelConnectionSettings(
            provider_name="test",
            base_url="https://example.com/v1",
            api_key="secret",
            model="model",
        ),
        reasoning_effort=None,
        source_registry=create_default_tool_registry(),
        prompt_builder=PromptBuilder(),
        project_instructions=(),
        permission_engine=PermissionEngine(),
        approval_broker=ApprovalBroker(),
        permission_config_store=PermissionConfigStore(tmp_path / "home"),
        permission_policy=PermissionPolicy(mode=PermissionMode.FULL_ACCESS),
        run_control=None,
    )
    emitted: list[RunEvent] = []

    async def scenario() -> None:
        async def emit(event: RunEvent) -> None:
            emitted.append(event)

        await runtime.run(
            ToolContext(
                workspace_path=tmp_path,
                correlation_id="run-nested",
                agent_id="supervisor",
                emit_event=emit,
            ),
            description="父级 Agent",
            prompt="继续委派",
        )

    asyncio.run(scenario())

    nested = next(event for event in emitted if event.item_id == "grandchild")
    assert nested.type == "agent_started"
    assert nested.metadata["agentId"] == "grandchild"
    assert nested.metadata["parentAgentId"] == "child-agent"


def test_active_agent_limit_fails_without_waiting(tmp_path: Path) -> None:
    class BlockingHarness(ChildHarness):
        def __init__(self) -> None:
            super().__init__()
            self.started = asyncio.Event()
            self.release = asyncio.Event()

        async def stream(self, *args: Any) -> AsyncIterator[RunEvent]:
            self.started.set()
            await self.release.wait()
            yield RunEvent(type="text_delta", delta="完成")
            yield RunEvent(type="completed", model="model")

    harness = BlockingHarness()
    runtime = SubagentRuntime(
        harness=harness,  # type: ignore[arg-type]
        settings=ModelConnectionSettings(
            provider_name="test",
            base_url="https://example.com/v1",
            api_key="secret",
            model="model",
        ),
        reasoning_effort=None,
        source_registry=create_default_tool_registry(),
        prompt_builder=PromptBuilder(),
        project_instructions=(),
        permission_engine=PermissionEngine(),
        approval_broker=ApprovalBroker(),
        permission_config_store=PermissionConfigStore(tmp_path / "home"),
        permission_policy=PermissionPolicy(mode=PermissionMode.FULL_ACCESS),
        run_control=None,
        max_active_agents=1,
    )

    async def scenario() -> tuple[ToolResult, ToolResult]:
        context = ToolContext(
            workspace_path=tmp_path,
            correlation_id="run-limit",
        )
        first_task = asyncio.create_task(runtime.run(
            context,
            description="第一个",
            prompt="等待",
        ))
        await harness.started.wait()
        second = await runtime.run(
            context,
            description="第二个",
            prompt="不应等待",
        )
        harness.release.set()
        return await first_task, second

    first, second = asyncio.run(scenario())

    assert first.is_error is False
    assert second.is_error is True
    assert second.metadata["failureKind"] == "agent_concurrency_limit"


def test_tool_executor_forwards_child_events_while_tool_is_running(
    tmp_path: Path,
) -> None:
    async def execute(context: ToolContext, _input: Any) -> ToolResult:
        assert context.emit_event is not None
        await context.emit_event(RunEvent(
            type="agent_started",
            item_id="agent-1",
            title="研究",
        ))
        await asyncio.sleep(0)
        await context.emit_event(RunEvent(
            type="agent_completed",
            item_id="agent-1",
            title="研究",
            output="完成",
        ))
        return ToolResult("完成")

    registry = ToolRegistry((function_tool(
        name="delegate_task",
        description="test",
        input_schema={"type": "object", "properties": {}},
        execute=execute,
        read_only=True,
        concurrency_safe=True,
    ),))
    executor = ToolCallExecutor(
        registry,
        PermissionEngine(),
        ApprovalBroker(),
        PermissionConfigStore(tmp_path / "home"),
        ToolResultProcessor(),
    )

    async def collect() -> list[RunEvent]:
        return [
            event
            async for event, _result in executor.execute(
                ProviderToolCall("call-1", "delegate_task", "{}"),
                ToolContext(tmp_path),
                "model",
                ModelConnectionSettings(
                    provider_name="test",
                    base_url="https://example.com/v1",
                    api_key="secret",
                    model="model",
                ),
                PermissionPolicy(mode=PermissionMode.FULL_ACCESS),
                0,
            )
        ]

    events = asyncio.run(collect())

    assert [event.type for event in events] == [
        "tool_started",
        "agent_started",
        "agent_completed",
        "tool_completed",
    ]
