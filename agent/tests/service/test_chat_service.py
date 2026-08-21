import asyncio
from collections.abc import AsyncIterator
from dataclasses import replace
from pathlib import Path
from typing import Any, ClassVar

from app.context.planner import ContextPlan
from app.dto.request.chat_completion_request import ChatCompletionRequest
from app.dto.request.model_list_request import ModelListRequest
from app.dto.response.chat_completion_response import (
    ChatCompletionResponse,
    TokenUsageResponse,
)
from app.harness.run_event import RunEvent, RunUsage
from app.mcp.model import McpServerConfig, McpToolDefinition
from app.model.model_connection_settings import ModelConnectionSettings
from app.prompt.prompt_builder import PromptBuilder
from app.service.chat_service import (
    ChatService,
    _stream_with_background_events,
    _with_prelude_usage,
)

_SESSION_CONTROL_TOOLS = (
    "delegate_task",
    "send_agent_message",
    "list_agent_sessions",
    "interrupt_agent",
    "report_to_parent",
    "create_workflow",
    "list_workflows",
    "run_workflow",
    "retry_workflow_node",
)


class ModelListProvider:
    def __init__(self) -> None:
        self.settings: ModelConnectionSettings | None = None

    async def list_models(
        self,
        settings: ModelConnectionSettings,
    ) -> list[str]:
        self.settings = settings
        return ["example-model"]


def test_list_models_does_not_require_chat_output_settings() -> None:
    provider = ModelListProvider()
    service = ChatService(provider, PromptBuilder())  # type: ignore[arg-type]

    models = asyncio.run(
        service.list_models(
            ModelListRequest(
                providerName="OpenAI compatible",
                baseUrl="https://example.com/v1",
                apiKey="secret",
            )
        )
    )

    assert models == ["example-model"]
    assert provider.settings is not None
    assert provider.settings.max_output_tokens is None


class CapturingHarness:
    def __init__(self) -> None:
        self.registry: Any = None
        self.tool_context: Any = None
        self.prompt: Any = None

    async def stream(
        self,
        _settings: Any,
        prompt: Any,
        _messages: Any,
        _reasoning_effort: Any,
        registry: Any,
        tool_context: Any,
        *_args: Any,
    ) -> AsyncIterator[RunEvent]:
        self.prompt = prompt
        self.registry = registry
        self.tool_context = tool_context
        if False:
            yield RunEvent(type="completed")


class UsageHarness:
    async def stream(self, *_args: Any) -> AsyncIterator[RunEvent]:
        yield RunEvent(
            type="usage",
            model="example-model",
            usage=RunUsage(
                prompt_tokens=20,
                completion_tokens=5,
                total_tokens=25,
                input_tokens=12,
                output_tokens=5,
                cache_read_tokens=8,
                cache_metrics_available=True,
            ),
        )
        yield RunEvent(type="completed", model="example-model")


class CompactingProvider(ModelListProvider):
    async def compact_context(self, *_args: Any) -> ChatCompletionResponse:
        return ChatCompletionResponse(
            message="summary",
            model="example-model",
            usage=TokenUsageResponse(
                promptTokens=10,
                completionTokens=2,
                totalTokens=12,
                inputTokens=4,
                outputTokens=2,
                cacheReadTokens=6,
                cacheMetricsAvailable=True,
            ),
        )


class AlwaysCompactingPlanner:
    def should_compact(self, *_args: Any) -> tuple[bool, int, int]:
        return True, 100, 80

    def split_for_compaction(self, messages: list[Any]) -> tuple[list[Any], list[Any]]:
        return messages[:1], messages[1:]

    def completed_plan(
        self,
        _prompt: Any,
        _messages: list[Any],
        retained: list[Any],
        summary: str,
        before_tokens: int,
    ) -> ContextPlan:
        return ContextPlan(
            messages=retained,
            summary=summary,
            compacted=True,
            before_tokens=before_tokens,
            after_tokens=40,
            through_sequence=1,
            retained_from_sequence=2,
        )


def test_automatic_compaction_usage_is_included_in_stream_totals() -> None:
    service = ChatService(
        CompactingProvider(),  # type: ignore[arg-type]
        PromptBuilder(),
        context_planner=AlwaysCompactingPlanner(),  # type: ignore[arg-type]
        agent_harness=UsageHarness(),  # type: ignore[arg-type]
    )
    request = ChatCompletionRequest.model_validate({
        "messages": [
            {"role": "user", "content": "old", "sequence": 1},
            {"role": "assistant", "content": "answer", "sequence": 2},
        ],
        "connection": {
            "providerName": "OpenAI compatible",
            "baseUrl": "https://example.com/v1",
            "model": "example-model",
            "apiKey": "secret",
        },
    })

    events = asyncio.run(_collect(service.stream(request)))

    compacted = next(event for event in events if event.type == "context_compacted")
    usage = next(event for event in events if event.type == "usage")
    assert compacted.usage is not None
    assert compacted.usage.total_tokens == 12
    assert usage.usage is not None
    assert usage.usage.total_tokens == 37
    assert usage.usage.input_tokens == 16
    assert usage.usage.cache_read_tokens == 14


def test_compaction_prelude_is_not_added_to_subagent_usage_delta() -> None:
    event = RunEvent(
        type="usage",
        usage=RunUsage(
            prompt_tokens=7,
            completion_tokens=3,
            total_tokens=10,
        ),
        metadata={"usageDelta": True, "usageCategory": "subagent"},
    )
    prelude = TokenUsageResponse(
        promptTokens=20,
        completionTokens=5,
        totalTokens=25,
    )

    projected = _with_prelude_usage(event, prelude)

    assert projected.usage == event.usage


def test_root_completion_is_emitted_after_background_settlement() -> None:
    queue: asyncio.Queue[RunEvent] = asyncio.Queue()

    class Manager:
        async def wait_for_activations(self) -> None:
            await queue.put(RunEvent(
                type="agent_reported",
                item_id="agent-1",
                output="完成",
            ))

        async def shutdown(self) -> None:
            return None

    async def root_stream() -> AsyncIterator[RunEvent]:
        yield RunEvent(type="completed")

    async def collect() -> list[RunEvent]:
        return [
            event
            async for event in _stream_with_background_events(
                root_stream(), queue, Manager()  # type: ignore[arg-type]
            )
        ]

    events = asyncio.run(collect())

    assert [event.type for event in events] == [
        "agent_reported",
        "completed",
    ]


def test_background_usage_deltas_extend_root_cumulative_usage() -> None:
    queue: asyncio.Queue[RunEvent] = asyncio.Queue()

    class Manager:
        async def wait_for_activations(self) -> None:
            await queue.put(_usage_delta(30))
            await queue.put(_usage_delta(20))

        async def shutdown(self) -> None:
            return None

    async def root_stream() -> AsyncIterator[RunEvent]:
        yield _usage_snapshot(100)
        yield RunEvent(type="completed")

    events = asyncio.run(_collect_merged_events(
        root_stream(), queue, Manager()  # type: ignore[arg-type]
    ))

    usage_events = [event for event in events if event.type == "usage"]
    assert [event.usage.total_tokens for event in usage_events if event.usage] == [
        100,
        130,
        150,
    ]
    assert [event.active_context_tokens for event in usage_events] == [
        4_000,
        4_000,
        4_000,
    ]
    assert all(
        event.metadata.get("usageDelta") is not True
        for event in usage_events
    )


def test_background_usage_delta_before_root_snapshot_is_not_overwritten() -> None:
    queue: asyncio.Queue[RunEvent] = asyncio.Queue()
    queue.put_nowait(_usage_delta(30))

    class Manager:
        async def wait_for_activations(self) -> None:
            await queue.put(_usage_delta(20))

        async def shutdown(self) -> None:
            return None

    async def root_stream() -> AsyncIterator[RunEvent]:
        yield _usage_snapshot(100)
        yield RunEvent(type="completed")

    events = asyncio.run(_collect_merged_events(
        root_stream(), queue, Manager()  # type: ignore[arg-type]
    ))

    usage_events = [event for event in events if event.type == "usage"]
    assert [event.usage.total_tokens for event in usage_events if event.usage] == [
        30,
        130,
        150,
    ]
    assert [event.active_context_tokens for event in usage_events] == [
        0,
        4_000,
        4_000,
    ]
    assert all(
        event.metadata.get("usageDelta") is not True
        for event in usage_events
    )


def test_background_usage_preserves_root_context_without_root_usage() -> None:
    queue: asyncio.Queue[RunEvent] = asyncio.Queue()

    class Manager:
        async def wait_for_activations(self) -> None:
            await queue.put(_usage_delta(30))

        async def shutdown(self) -> None:
            return None

    async def root_stream() -> AsyncIterator[RunEvent]:
        yield RunEvent(type="usage", active_context_tokens=4_000)
        yield RunEvent(type="completed")

    events = asyncio.run(_collect_merged_events(
        root_stream(), queue, Manager()  # type: ignore[arg-type]
    ))

    background_usage = next(event for event in events if event.usage is not None)
    assert background_usage.usage is not None
    assert background_usage.usage.total_tokens == 30
    assert background_usage.active_context_tokens == 4_000


def test_usage_on_non_usage_root_event_is_part_of_background_total() -> None:
    queue: asyncio.Queue[RunEvent] = asyncio.Queue()

    class Manager:
        async def wait_for_activations(self) -> None:
            await queue.put(_usage_delta(30))
            await queue.put(_usage_delta(20))

        async def shutdown(self) -> None:
            return None

    async def root_stream() -> AsyncIterator[RunEvent]:
        yield replace(_usage_snapshot(100), type="context_compacted")
        yield RunEvent(type="completed")

    events = asyncio.run(_collect_merged_events(
        root_stream(), queue, Manager()  # type: ignore[arg-type]
    ))

    usage_events = [event for event in events if event.usage is not None]
    assert [event.usage.total_tokens for event in usage_events if event.usage] == [
        100,
        130,
        150,
    ]


def test_usage_on_delayed_root_terminal_includes_background_total() -> None:
    queue: asyncio.Queue[RunEvent] = asyncio.Queue()

    class Manager:
        async def wait_for_activations(self) -> None:
            raise AssertionError("failed root must shut down activations")

        async def shutdown(self) -> None:
            await queue.put(_usage_delta(30))
            await queue.put(_usage_delta(20))

    async def root_stream() -> AsyncIterator[RunEvent]:
        yield replace(
            _usage_snapshot(100),
            type="failed",
            error_message="root failed",
        )

    events = asyncio.run(_collect_merged_events(
        root_stream(), queue, Manager()  # type: ignore[arg-type]
    ))

    usage_events = [event for event in events if event.usage is not None]
    assert [event.usage.total_tokens for event in usage_events if event.usage] == [
        130,
        150,
        150,
    ]
    assert events[-1].type == "failed"
    assert events[-1].active_context_tokens == 4_000


def _usage_snapshot(total_tokens: int) -> RunEvent:
    return RunEvent(
        type="usage",
        usage=RunUsage(
            prompt_tokens=total_tokens,
            total_tokens=total_tokens,
        ),
        active_context_tokens=4_000,
    )


def _usage_delta(total_tokens: int) -> RunEvent:
    return RunEvent(
        type="usage",
        usage=RunUsage(
            completion_tokens=total_tokens,
            total_tokens=total_tokens,
        ),
        metadata={"usageDelta": True, "usageCategory": "subagent"},
    )


async def _collect_merged_events(
    stream: AsyncIterator[RunEvent],
    queue: asyncio.Queue[RunEvent],
    manager: Any,
) -> list[RunEvent]:
    return [
        event
        async for event in _stream_with_background_events(
            stream,
            queue,
            manager,
        )
    ]


class FakeMcpClient:
    instances: ClassVar[list["FakeMcpClient"]] = []

    def __init__(self, config: McpServerConfig) -> None:
        self.config = config
        self.closed = False
        self.instances.append(self)

    async def connect(self) -> None:
        return None

    def supports(self, _capability: str) -> bool:
        return False

    async def list_tools(self) -> tuple[McpToolDefinition, ...]:
        return (
            McpToolDefinition(
                name="echo",
                description="Return text unchanged",
                input_schema={
                    "type": "object",
                    "properties": {"text": {"type": "string"}},
                    "required": ["text"],
                    "additionalProperties": False,
                },
                annotations={"readOnlyHint": True},
            ),
        )

    async def call_tool(self, _name: str, _input: Any) -> dict[str, Any]:
        return {"content": [{"type": "text", "text": "ok"}]}

    async def close(self) -> None:
        self.closed = True


class CapabilityMcpClient(FakeMcpClient):
    def supports(self, capability: str) -> bool:
        return capability in {"resources", "prompts"}


def test_remote_mcp_is_available_without_workspace(monkeypatch: Any) -> None:
    FakeMcpClient.instances.clear()
    monkeypatch.setattr("app.service.chat_service.McpClient", FakeMcpClient)
    harness = CapturingHarness()
    service = ChatService(
        ModelListProvider(),  # type: ignore[arg-type]
        PromptBuilder(),
        agent_harness=harness,  # type: ignore[arg-type]
    )
    request = ChatCompletionRequest.model_validate(
        {
            "messages": [{"role": "user", "content": "call Remote MCP echo"}],
            "connection": {
                "providerName": "OpenAI compatible",
                "baseUrl": "https://example.com/v1",
                "model": "example-model",
                "apiKey": "secret",
            },
            "promptContext": {
                "mcpServers": [
                    {
                        "serverId": "remote",
                        "name": "Remote",
                        "enabled": True,
                        "url": "https://mcp.example/mcp",
                    }
                ]
            },
        }
    )

    asyncio.run(_drain(service.stream(request, "correlation")))

    assert harness.registry.names() == (
        "mcp__remote__echo",
        *_SESSION_CONTROL_TOOLS,
    )
    assert harness.tool_context is not None
    assert harness.tool_context.workspace_scoped is False
    assert [tool["function"]["name"] for tool in harness.prompt.tools] == [
        "mcp__remote__echo",
        *_SESSION_CONTROL_TOOLS,
    ]
    assert "  - delegate_task" in harness.prompt.system_prompt
    assert "已连接 1 个可选 MCP 工具" in harness.prompt.system_prompt
    assert len(FakeMcpClient.instances) == 1
    assert FakeMcpClient.instances[0].closed is False


def test_pdf_tools_are_exposed_without_workspace_for_attached_pdf(
    tmp_path: Path,
) -> None:
    pdf_path = tmp_path / "manual.pdf"
    pdf_path.write_bytes(b"%PDF-1.4\n%%EOF\n")
    harness = CapturingHarness()
    service = ChatService(
        ModelListProvider(),  # type: ignore[arg-type]
        PromptBuilder(),
        agent_harness=harness,  # type: ignore[arg-type]
    )
    request = ChatCompletionRequest.model_validate({
        "messages": [{
            "role": "user",
            "content": "读取附件",
            "attachments": [{
                "attachmentId": "pdf-1",
                "name": "manual.pdf",
                "mimeType": "application/pdf",
                "size": pdf_path.stat().st_size,
                "path": str(pdf_path),
                "kind": "FILE",
                "source": "LOCAL_FILE",
            }],
        }],
        "connection": {
            "providerName": "DeepSeek",
            "baseUrl": "https://api.deepseek.com/anthropic",
            "model": "deepseek-v4-pro",
            "apiKey": "secret",
            "apiFormat": "anthropic",
        },
    })

    asyncio.run(_drain(service.stream(request, "pdf-run")))

    assert [tool["function"]["name"] for tool in harness.prompt.tools] == [
        "read_pdf",
        "search_pdf",
        *_SESSION_CONTROL_TOOLS,
    ]
    assert harness.tool_context.workspace_scoped is False
    attachment = harness.tool_context.attachments["pdf-1"]
    assert attachment.path == pdf_path
    assert attachment.mime_type == "application/pdf"


def test_mcp_session_is_reused_across_turns_and_closed_on_shutdown(
    monkeypatch: Any,
) -> None:
    FakeMcpClient.instances.clear()
    monkeypatch.setattr("app.service.chat_service.McpClient", FakeMcpClient)
    service = ChatService(
        ModelListProvider(),  # type: ignore[arg-type]
        PromptBuilder(),
        agent_harness=CapturingHarness(),  # type: ignore[arg-type]
    )
    request = _mcp_request("调用 MCP 工具 echo")
    request.prompt_context.task_id = "task-1"

    async def run_two_turns() -> None:
        await _drain(service.stream(request, "turn-1"))
        await _drain(service.stream(request, "turn-2"))
        assert len(FakeMcpClient.instances) == 1
        assert FakeMcpClient.instances[0].closed is False
        await service.close()

    asyncio.run(run_two_turns())

    assert FakeMcpClient.instances[0].closed is True


def test_mcp_server_is_not_connected_for_ordinary_request(
    monkeypatch: Any,
) -> None:
    CapabilityMcpClient.instances.clear()
    monkeypatch.setattr(
        "app.service.chat_service.McpClient", CapabilityMcpClient
    )
    harness = CapturingHarness()
    service = ChatService(
        ModelListProvider(),  # type: ignore[arg-type]
        PromptBuilder(),
        agent_harness=harness,  # type: ignore[arg-type]
    )

    asyncio.run(_drain(service.stream(_mcp_request("解释一下 Python 装饰器"))))

    assert all(
        not name.startswith(("mcp__", "mcpmeta__"))
        for name in harness.registry.names()
    )
    assert [tool["function"]["name"] for tool in harness.prompt.tools] == [
        *_SESSION_CONTROL_TOOLS,
    ]
    assert CapabilityMcpClient.instances == []


def test_mcp_capability_catalogs_are_exposed_for_explicit_feature_request(
    monkeypatch: Any,
) -> None:
    monkeypatch.setattr(
        "app.service.chat_service.McpClient", CapabilityMcpClient
    )
    harness = CapturingHarness()
    service = ChatService(
        ModelListProvider(),  # type: ignore[arg-type]
        PromptBuilder(),
        agent_harness=harness,  # type: ignore[arg-type]
    )

    asyncio.run(_drain(service.stream(_mcp_request("列出 MCP 的 Resources 和 Prompts"))))

    assert harness.registry.names() == (
        "mcp__remote__echo",
        "mcpmeta__remote__resource_catalog",
        "mcpmeta__remote__resource_read",
        "mcpmeta__remote__prompt_catalog",
        "mcpmeta__remote__prompt_get",
        *_SESSION_CONTROL_TOOLS,
    )


def test_mcp_server_name_activates_related_request(monkeypatch: Any) -> None:
    monkeypatch.setattr(
        "app.service.chat_service.McpClient", CapabilityMcpClient
    )
    harness = CapturingHarness()
    service = ChatService(
        ModelListProvider(),  # type: ignore[arg-type]
        PromptBuilder(),
        agent_harness=harness,  # type: ignore[arg-type]
    )

    request = _mcp_request("查看 GitHub 上的 issue")
    request.prompt_context.mcp_servers[0].name = "GitHub"
    asyncio.run(_drain(service.stream(request)))

    assert harness.registry.names() == (
        "mcp__remote__echo",
        *_SESSION_CONTROL_TOOLS,
    )


def test_conceptual_mcp_question_does_not_connect_generic_server(
    monkeypatch: Any,
) -> None:
    CapabilityMcpClient.instances.clear()
    monkeypatch.setattr(
        "app.service.chat_service.McpClient", CapabilityMcpClient
    )
    harness = CapturingHarness()
    service = ChatService(
        ModelListProvider(),  # type: ignore[arg-type]
        PromptBuilder(),
        agent_harness=harness,  # type: ignore[arg-type]
    )

    asyncio.run(_drain(service.stream(_mcp_request("MCP 是什么？"))))

    assert CapabilityMcpClient.instances == []


def test_explicit_chinese_mcp_invocation_connects_server(
    monkeypatch: Any,
) -> None:
    CapabilityMcpClient.instances.clear()
    monkeypatch.setattr(
        "app.service.chat_service.McpClient", CapabilityMcpClient
    )
    harness = CapturingHarness()
    service = ChatService(
        ModelListProvider(),  # type: ignore[arg-type]
        PromptBuilder(),
        agent_harness=harness,  # type: ignore[arg-type]
    )

    asyncio.run(_drain(service.stream(_mcp_request("调用MCP工具 echo"))))

    assert len(CapabilityMcpClient.instances) == 1


def _mcp_request(content: str) -> ChatCompletionRequest:
    return ChatCompletionRequest.model_validate(
        {
            "messages": [{"role": "user", "content": content}],
            "connection": {
                "providerName": "OpenAI compatible",
                "baseUrl": "https://example.com/v1",
                "model": "example-model",
                "apiKey": "secret",
            },
            "promptContext": {
                "mcpServers": [
                    {
                        "serverId": "remote",
                        "name": "Remote",
                        "enabled": True,
                        "url": "https://mcp.example/mcp",
                    }
                ]
            },
        }
    )


async def _drain(events: AsyncIterator[RunEvent]) -> None:
    async for _event in events:
        pass


async def _collect(events: AsyncIterator[RunEvent]) -> list[RunEvent]:
    return [event async for event in events]
