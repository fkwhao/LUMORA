import asyncio
import json
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from app.dto.request.chat_completion_request import (
    AgentCheckpointRequest,
    AgentSessionSnapshotRequest,
    ChatMessageRequest,
)
from app.dto.response.chat_completion_response import (
    ChatCompletionResponse,
    TokenUsageResponse,
)
from app.execution.tool_call_executor import ToolCallExecutor
from app.execution.tool_result_processor import ToolResultProcessor
from app.harness.agent_harness import HistoryCompactionPlan
from app.harness.contracts import ProviderToolCall
from app.harness.run_control import RunControl
from app.harness.run_event import RunEvent, RunUsage
from app.model.model_connection_settings import ModelConnectionSettings
from app.permission.broker import ApprovalBroker
from app.permission.config_store import PermissionConfigStore
from app.permission.engine import PermissionEngine
from app.permission.model import PermissionMode, PermissionPolicy
from app.prompt.prompt_builder import PromptBuilder
from app.subagent.continuable import ContinuableSessionManager
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
        self.prompt_supplier: Any = None
        self.conversation_summary: Any = None
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
        self.prompt_supplier = _args[5]
        self.conversation_summary = _args[6]
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
    assert "mode=one_shot" in harness.prompt.system_prompt
    assert "mode=continuable" in harness.prompt.system_prompt
    compacted_prompt = harness.prompt_supplier("子 Agent 历史摘要")
    assert any(
        "子 Agent 历史摘要" in message["content"]
        for message in compacted_prompt.context_messages
    )
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
    assert "mode=one_shot" in tool.description
    assert "mode=continuable" in tool.description
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


def test_continuable_session_uses_fifo_inbox_and_serial_activations(
    tmp_path: Path,
) -> None:
    class SerialHarness(ChildHarness):
        def __init__(self) -> None:
            super().__init__()
            self.started: asyncio.Queue[int] = asyncio.Queue()
            self.release: asyncio.Queue[None] = asyncio.Queue()
            self.activation_messages: list[list[Any]] = []

        async def stream(
            self,
            _settings: Any,
            _prompt: Any,
            messages: Any,
            _reasoning_effort: Any,
            _registry: Any,
            *_args: Any,
        ) -> AsyncIterator[RunEvent]:
            activation = len(self.activation_messages) + 1
            self.activation_messages.append(list(messages))
            await self.started.put(activation)
            await self.release.get()
            yield RunEvent(type="text_delta", delta=f"报告 {activation}")
            yield RunEvent(type="completed", model="model")

    harness = SerialHarness()
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
    manager = ContinuableSessionManager(runtime)
    runtime.bind_session_manager(manager)
    events: list[RunEvent] = []

    async def scenario() -> None:
        async def emit(event: RunEvent) -> None:
            events.append(event)

        context = ToolContext(
            workspace_path=tmp_path,
            correlation_id="run-continuable",
            task_id="task-1",
            session_id="run-continuable",
            agent_id="supervisor",
            background_event=emit,
        )
        result = await manager.start(
            context,
            description="持续研究",
            prompt="先检查入口",
        )
        assert result.is_error is False
        assert harness.activation_messages == []
        agent_id = str(result.metadata["agentId"])
        assert await harness.started.get() == 1
        await manager.send(context, agent_id, "再验证测试")
        assert len(harness.activation_messages) == 1
        await harness.release.put(None)
        assert await harness.started.get() == 2
        assert [
            message.content for message in harness.activation_messages[1]
            if message.role == "user"
        ] == ["先检查入口", "再验证测试"]
        await harness.release.put(None)
        await manager.wait_for_activations()
        listed = json.loads(manager.list(context).content)
        assert listed[0]["status"] == "idle"
        assert listed[0]["pendingInbox"] == 0
        assert listed[0]["checkpointSequence"] == 4

    asyncio.run(scenario())

    assert [event.type for event in events].count("agent_activation_started") == 2
    assert [event.type for event in events].count("agent_checkpointed") == 4
    assert [
        event.metadata["consumedInboxSequence"]
        for event in events
        if event.type == "agent_activation_started"
    ] == [1, 2]


def test_continuable_session_compacts_and_recovers_its_own_context(
    tmp_path: Path,
) -> None:
    class CompactingHarness(ChildHarness):
        def __init__(self) -> None:
            super().__init__()
            self.compaction_messages: list[ChatMessageRequest] = []
            self.existing_summary: str | None = None
            self.stream_messages: list[ChatMessageRequest] = []
            self.stream_summary: str | None = None
            self.inline_prompt: Any = None
            self._planned = False

        def plan_history_compaction(
            self,
            _settings: Any,
            _prompt: Any,
            messages: list[ChatMessageRequest],
        ) -> HistoryCompactionPlan | None:
            if self._planned:
                return None
            self._planned = True
            return HistoryCompactionPlan(
                compactable=list(messages[:-5]),
                retained=list(messages[-5:]),
                before_tokens=18_000,
            )

        async def compact_history(
            self,
            _settings: Any,
            messages: list[ChatMessageRequest],
            existing_summary: str | None,
        ) -> ChatCompletionResponse:
            self.compaction_messages = list(messages)
            self.existing_summary = existing_summary
            return ChatCompletionResponse(
                message="新的子 Session 摘要",
                model="model",
                usage=TokenUsageResponse(
                    promptTokens=40,
                    completionTokens=20,
                    totalTokens=60,
                ),
            )

        def estimate_context_tokens(self, *_args: Any) -> int:
            return 3_500

        async def stream(
            self,
            _settings: Any,
            prompt: Any,
            messages: Any,
            _reasoning_effort: Any,
            _registry: Any,
            *_args: Any,
        ) -> AsyncIterator[RunEvent]:
            self.prompt = prompt
            self.stream_messages = list(messages)
            self.stream_summary = _args[6]
            self.inline_prompt = _args[5]("中途更新后的摘要")
            yield RunEvent(
                type="context_compacted",
                item_id="context-inline-test",
                title="已压缩上下文",
                metadata={
                    "summary": "中途更新后的摘要",
                    "beforeTokens": 8_000,
                    "afterTokens": 2_500,
                    "phase": "mid_turn",
                    "compactedMessageCount": 1,
                    "retainedMessageCount": 4,
                },
                model="model",
                usage=RunUsage(
                    prompt_tokens=25,
                    completion_tokens=10,
                    total_tokens=35,
                ),
            )
            yield RunEvent(type="text_delta", delta="压缩后继续完成。")
            yield RunEvent(
                type="usage",
                model="model",
                usage=RunUsage(
                    prompt_tokens=30,
                    completion_tokens=15,
                    total_tokens=45,
                ),
            )
            yield RunEvent(type="completed", model="model")

    history = [
        ChatMessageRequest(
            role="user" if index % 2 else "assistant",
            content=f"历史消息 {index}",
        )
        for index in range(1, 8)
    ]
    snapshot = AgentSessionSnapshotRequest(
        agentId="agent-context",
        sessionId="run-context:agent:agent-context",
        parentAgentId="supervisor",
        parentSessionId="run-context",
        label="长期研究",
        delegationDepth=1,
        model="model",
        checkpoint=AgentCheckpointRequest(
            sequence=4,
            consumedInboxSequence=0,
            transcript=history,
            summary="旧的子 Session 摘要",
        ),
    )
    harness = CompactingHarness()
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
    manager = ContinuableSessionManager(runtime, (snapshot,))
    events: list[RunEvent] = []

    async def scenario() -> None:
        async def emit(event: RunEvent) -> None:
            events.append(event)

        context = ToolContext(
            workspace_path=tmp_path,
            correlation_id="run-context",
            session_id="run-context",
            agent_id="supervisor",
            background_event=emit,
        )
        result = await manager.send(
            context,
            "agent-context",
            "继续长期研究",
        )
        assert result.is_error is False
        await manager.wait_for_activations()

    asyncio.run(scenario())

    assert harness.existing_summary == "旧的子 Session 摘要"
    assert len(harness.compaction_messages) == 3
    assert len(harness.stream_messages) == 5
    assert harness.stream_summary == "新的子 Session 摘要"
    assert any(
        "新的子 Session 摘要" in message["content"]
        for message in harness.prompt.context_messages
    )
    assert any(
        "中途更新后的摘要" in message["content"]
        for message in harness.inline_prompt.context_messages
    )
    compacted_steps = [
        event for event in events
        if event.type == "agent_event"
        and event.metadata.get("childEventType") == "context_compacted"
    ]
    assert [event.metadata["phase"] for event in compacted_steps] == [
        "pre_activation",
        "mid_turn",
    ]
    compacted_checkpoint = next(
        event for event in events
        if event.type == "agent_checkpointed"
        and event.metadata.get("summary") == "新的子 Session 摘要"
        and len(event.metadata.get("transcript", [])) == 5
    )
    assert compacted_checkpoint.metadata["agentStatus"] == "running"
    mid_turn_checkpoint = next(
        event for event in events
        if event.type == "agent_checkpointed"
        and event.metadata.get("summary") == "中途更新后的摘要"
        and len(event.metadata.get("transcript", [])) == 4
    )
    assert mid_turn_checkpoint.metadata["agentStatus"] == "running"
    usage = next(event for event in events if event.type == "usage")
    assert usage.usage is not None
    assert usage.usage.total_tokens == 105
    final_checkpoint = [
        event for event in events if event.type == "agent_checkpointed"
    ][-1]
    assert final_checkpoint.metadata["summary"] == "中途更新后的摘要"
    assert len(final_checkpoint.metadata["transcript"]) == 5


def test_continuable_interrupt_and_report_preserve_session(
    tmp_path: Path,
) -> None:
    class WaitingHarness(ChildHarness):
        def __init__(self) -> None:
            super().__init__()
            self.started = asyncio.Event()

        async def stream(self, *args: Any) -> AsyncIterator[RunEvent]:
            yield RunEvent(
                type="usage",
                model="model",
                usage=RunUsage(
                    prompt_tokens=21,
                    completion_tokens=5,
                    total_tokens=26,
                ),
            )
            self.started.set()
            await asyncio.Event().wait()
            if False:
                yield RunEvent(type="completed")

    harness = WaitingHarness()
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
    manager = ContinuableSessionManager(runtime)
    events: list[RunEvent] = []

    async def scenario() -> None:
        async def emit(event: RunEvent) -> None:
            events.append(event)

        parent = ToolContext(
            workspace_path=tmp_path,
            correlation_id="run-interrupt",
            session_id="run-interrupt",
            agent_id="supervisor",
            background_event=emit,
        )
        started = await manager.start(
            parent, description="等待", prompt="持续等待"
        )
        await harness.started.wait()
        agent_id = str(started.metadata["agentId"])
        session_id = str(started.metadata["sessionId"])
        report = await manager.report(
            ToolContext(
                workspace_path=tmp_path,
                session_id=session_id,
                agent_id=agent_id,
                background_event=emit,
            ),
            "阶段完成",
            False,
        )
        assert report.is_error is False
        interrupted = await manager.interrupt(parent, agent_id, "改变方向")
        assert interrupted.is_error is False
        await manager.wait_for_activations()
        listed = json.loads(manager.list(parent).content)
        assert listed[0]["status"] == "interrupted"
        assert listed[0]["latestReport"] == "阶段完成"

    asyncio.run(scenario())

    assert any(event.type == "agent_reported" for event in events)
    interrupted_event = next(
        event for event in events
        if event.type == "agent_activation_interrupted"
    )
    assert interrupted_event.metadata["totalTokens"] == 26
    usage_events = [event for event in events if event.type == "usage"]
    assert len(usage_events) == 1
    assert usage_events[0].usage is not None
    assert usage_events[0].usage.total_tokens == 26
    assert usage_events[0].metadata["usageDelta"] is True
    assert [event.type for event in events].index("usage") < [
        event.type for event in events
    ].index("agent_activation_interrupted")
    assert any(
        event.type == "agent_checkpointed"
        and event.metadata["agentStatus"] == "interrupted"
        for event in events
    )


def test_continuable_failure_preserves_usage_emitted_before_failure(
    tmp_path: Path,
) -> None:
    class FailingHarness(ChildHarness):
        async def stream(self, *args: Any) -> AsyncIterator[RunEvent]:
            yield RunEvent(
                type="usage",
                model="model",
                usage=RunUsage(
                    prompt_tokens=34,
                    completion_tokens=8,
                    total_tokens=42,
                ),
            )
            yield RunEvent(type="failed", error_message="模型流失败")

    runtime = SubagentRuntime(
        harness=FailingHarness(),  # type: ignore[arg-type]
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
    manager = ContinuableSessionManager(runtime)
    events: list[RunEvent] = []

    async def scenario() -> None:
        async def emit(event: RunEvent) -> None:
            events.append(event)

        context = ToolContext(
            workspace_path=tmp_path,
            correlation_id="run-failure-usage",
            session_id="run-failure-usage",
            agent_id="supervisor",
            background_event=emit,
        )
        started = await manager.start(
            context,
            description="失败研究",
            prompt="先产生用量再失败",
        )
        assert started.is_error is False
        await manager.wait_for_activations()
        listed = json.loads(manager.list(context).content)
        assert listed[0]["status"] == "failed"

    asyncio.run(scenario())

    usage_events = [event for event in events if event.type == "usage"]
    assert len(usage_events) == 1
    assert usage_events[0].usage is not None
    assert usage_events[0].usage.total_tokens == 42
    assert usage_events[0].metadata["usageDelta"] is True
    event_types = [event.type for event in events]
    failed_event = next(event for event in events if event.type == "agent_failed")
    assert failed_event.metadata["totalTokens"] == 42
    assert event_types.index("usage") < event_types.index("agent_failed")
