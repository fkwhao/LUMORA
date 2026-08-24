import asyncio
from pathlib import Path

from app.dto.request.chat_completion_request import ChatMessageRequest
from app.dto.response.chat_completion_response import (
    ChatCompletionResponse,
    TokenUsageResponse,
)
from app.execution.budget import ExecutionBudgetLedger
from app.harness.agent_harness import AgentHarness
from app.harness.contracts import ProviderTurn, ProviderTurnEvent
from app.harness.run_control import RunControl, RunControlRegistry
from app.harness.run_event import RunEvent, RunUsage
from app.model.model_connection_settings import ModelConnectionSettings
from app.permission.broker import ApprovalBroker
from app.permission.config_store import PermissionConfigStore
from app.permission.engine import PermissionEngine
from app.permission.model import PermissionPolicy
from app.prompt.prompt_assembly import PromptAssembly
from app.prompt.prompt_segment import (
    PromptCachePolicy,
    PromptPriority,
    PromptSegment,
    PromptTarget,
    PromptTrustLevel,
)
from app.tool.base import ToolContext
from app.tool.registry import ToolRegistry


class StrategyRecordingProvider:
    def __init__(self) -> None:
        self.stream_calls = 0
        self.turn_calls = 0
        self.turn_stream_calls = 0

    async def stream(self, *args, **kwargs):
        del args, kwargs
        self.stream_calls += 1
        yield RunEvent(type="text_delta", delta="流式回答", model="test-model")
        yield RunEvent(
            type="usage",
            model="test-model",
            usage=RunUsage(4, 2, 6),
        )
        yield RunEvent(type="completed", model="test-model")

    async def complete_agent_turn(self, *args, **kwargs) -> ProviderTurn:
        del args, kwargs
        self.turn_calls += 1
        return ProviderTurn(
            content="工具模式回答",
            reasoning="",
            model="test-model",
            usage=TokenUsageResponse(
                promptTokens=5,
                completionTokens=3,
                totalTokens=8,
            ),
            tool_calls=(),
        )

    async def stream_agent_turn(self, *args, **kwargs):
        del args, kwargs
        self.turn_stream_calls += 1
        yield ProviderTurnEvent(
            type="content_delta",
            delta="工具模式回答",
            model="test-model",
        )
        yield ProviderTurnEvent(
            type="completed",
            model="test-model",
            turn=ProviderTurn(
                content="工具模式回答",
                reasoning="",
                model="test-model",
                usage=TokenUsageResponse(
                    promptTokens=5,
                    completionTokens=3,
                    totalTokens=8,
                ),
                tool_calls=(),
            ),
        )

    async def compact_agent_history(self, *args, **kwargs):
        del args, kwargs
        raise AssertionError("该测试不应压缩上下文")


def _settings() -> ModelConnectionSettings:
    return ModelConnectionSettings(
        provider_name="test",
        base_url="https://example.com/v1",
        api_key="secret",
        model="test-model",
    )


def _tool_prompt() -> PromptAssembly:
    return PromptAssembly((
        PromptSegment(
            key="test.tool",
            target=PromptTarget.TOOLS,
            content={
                "type": "function",
                "function": {
                    "name": "example_tool",
                    "description": "测试工具",
                    "parameters": {"type": "object", "properties": {}},
                },
            },
            trust_level=PromptTrustLevel.TRUSTED,
            priority=PromptPriority.REQUIRED,
            cache_policy=PromptCachePolicy.REQUEST,
        ),
    ))


async def _collect(
    harness: AgentHarness,
    prompt: PromptAssembly,
    tool_context: ToolContext | None,
    run_control: RunControl | None = None,
) -> list[RunEvent]:
    return [
        event
        async for event in harness.stream(
            _settings(),
            prompt,
            [ChatMessageRequest(role="user", content="你好")],
            None,
            ToolRegistry(),
            tool_context,
            PermissionPolicy(),
            PermissionEngine(),
            ApprovalBroker(),
            PermissionConfigStore(),
            lambda _summary: prompt,
            None,
            run_control,
        )
    ]


def test_harness_uses_native_stream_strategy_without_tools() -> None:
    provider = StrategyRecordingProvider()
    events = asyncio.run(
        _collect(AgentHarness(provider), PromptAssembly(()), None)  # type: ignore[arg-type]
    )

    assert [event.type for event in events] == [
        "text_delta",
        "usage",
        "completed",
    ]
    assert provider.stream_calls == 1
    assert provider.turn_calls == 0


def test_harness_uses_agent_loop_strategy_with_tools(tmp_path: Path) -> None:
    provider = StrategyRecordingProvider()
    prompt = _tool_prompt()
    events = asyncio.run(
        _collect(
            AgentHarness(provider),  # type: ignore[arg-type]
            prompt,
            ToolContext(workspace_path=tmp_path),
        )
    )

    assert [event.type for event in events] == [
        "text_delta",
        "protocol_message",
        "usage",
        "completed",
    ]
    assert events[0].delta == "工具模式回答"
    assert provider.stream_calls == 0
    assert provider.turn_calls == 0
    assert provider.turn_stream_calls == 1


def test_harness_plans_and_compacts_persistable_agent_history() -> None:
    class CompactionProvider(StrategyRecordingProvider):
        def __init__(self) -> None:
            super().__init__()
            self.compacted_messages = []
            self.existing_summary = None

        async def compact_agent_history(
            self,
            _settings,
            messages,
            existing_summary,
        ):
            self.compacted_messages = messages
            self.existing_summary = existing_summary
            return ChatCompletionResponse(
                message="更新摘要",
                model="test-model",
                usage=TokenUsageResponse(
                    promptTokens=20,
                    completionTokens=5,
                    totalTokens=25,
                ),
            )

    provider = CompactionProvider()
    harness = AgentHarness(provider)  # type: ignore[arg-type]
    settings = ModelConnectionSettings(
        provider_name="test",
        base_url="https://example.com/v1",
        api_key="secret",
        model="test-model",
        context_window=20_000,
        max_output_tokens=2_000,
    )
    messages = [
        ChatMessageRequest(
            role="user" if index % 2 else "assistant",
            content=f"history-{index}-" + "x" * 10_000,
            providerState=(
                {
                    "apiFormat": "anthropic",
                    "contentBlocks": [{
                        "type": "thinking",
                        "thinking": "hidden reasoning",
                        "signature": "signed",
                    }],
                }
                if index == 2
                else {}
            ),
        )
        for index in range(1, 8)
    ]

    plan = harness.plan_history_compaction(
        settings,
        PromptAssembly(()),
        messages,
    )

    assert plan is not None
    assert plan.compactable
    assert any(message.provider_state for message in plan.compactable)
    assert len(plan.retained) >= 5
    compacted = asyncio.run(harness.compact_history(
        settings,
        plan.compactable,
        "旧摘要",
    ))
    assert compacted.message == "更新摘要"
    assert provider.existing_summary == "旧摘要"
    assert len(provider.compacted_messages) == len(plan.compactable)
    assert all(
        "provider_state" not in message
        for message in provider.compacted_messages
    )


def test_harness_never_treats_cumulative_token_usage_as_an_execution_limit(
    tmp_path: Path,
) -> None:
    class HighUsageProvider(StrategyRecordingProvider):
        async def stream(self, *args, **kwargs):
            del args, kwargs
            yield RunEvent(type="text_delta", delta="继续执行", model="test-model")
            yield RunEvent(
                type="usage",
                model="test-model",
                usage=RunUsage(1_500_000, 500_000, 2_000_000),
            )
            yield RunEvent(type="completed", model="test-model")

        async def stream_agent_turn(self, *args, **kwargs):
            del args, kwargs
            yield ProviderTurnEvent(
                type="content_delta",
                delta="继续执行",
                model="test-model",
            )
            yield ProviderTurnEvent(
                type="completed",
                model="test-model",
                turn=ProviderTurn(
                    content="继续执行",
                    reasoning="",
                    model="test-model",
                    usage=TokenUsageResponse(
                        promptTokens=1_500_000,
                        completionTokens=500_000,
                        totalTokens=2_000_000,
                    ),
                    tool_calls=(),
                ),
            )

    ledger = ExecutionBudgetLedger()
    provider = HighUsageProvider()
    plain_events = asyncio.run(_collect(
        AgentHarness(provider),  # type: ignore[arg-type]
        PromptAssembly(()),
        ToolContext(workspace_path=tmp_path, execution_budget=ledger),
    ))
    tool_events = asyncio.run(_collect(
        AgentHarness(provider),  # type: ignore[arg-type]
        _tool_prompt(),
        ToolContext(workspace_path=tmp_path, execution_budget=ledger),
    ))

    assert plain_events[-1].type == "completed"
    assert tool_events[-1].type == "completed"
    assert all(event.type != "failed" for event in [*plain_events, *tool_events])
    assert max(
        event.usage.total_tokens
        for event in [*plain_events, *tool_events]
        if event.usage is not None
    ) == 2_000_000


def test_harness_cancels_a_stalled_plain_model_stream_on_pause() -> None:
    asyncio.run(_assert_plain_stream_is_cancelled())


def test_harness_continues_a_plain_stream_when_a_steer_arrives() -> None:
    asyncio.run(_assert_plain_stream_continues_with_steer())


async def _assert_plain_stream_continues_with_steer() -> None:
    controls = RunControlRegistry()
    control = controls.register("plain-steer")

    class SteeringProvider(StrategyRecordingProvider):
        async def stream(self, *args, **kwargs):
            async for event in super().stream(*args, **kwargs):
                if event.type == "completed":
                    assert await controls.add_steer(
                        "plain-steer", "input-1", "补充安全检查"
                    )
                yield event

    provider = SteeringProvider()
    events = await _collect(
        AgentHarness(provider),  # type: ignore[arg-type]
        PromptAssembly(()),
        None,
        control,
    )
    controls.unregister("plain-steer", control)

    assert "steer_claimed" in [event.type for event in events]
    assert "text_reset" in [event.type for event in events]
    assert provider.stream_calls == 1
    assert provider.turn_stream_calls == 1
    usage = [event.usage for event in events if event.usage is not None]
    assert usage[-1].total_tokens == 14
    assert events[-1].type == "completed"


async def _assert_plain_stream_is_cancelled() -> None:
    started = asyncio.Event()
    cancelled = asyncio.Event()

    class StalledProvider(StrategyRecordingProvider):
        async def stream(self, *args, **kwargs):
            del args, kwargs
            started.set()
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()
            yield RunEvent(type="completed")

    registry = RunControlRegistry()
    control = registry.register("plain-run")
    run_task = asyncio.create_task(_collect(
        AgentHarness(StalledProvider()),  # type: ignore[arg-type]
        PromptAssembly(()),
        None,
        control,
    ))
    await asyncio.wait_for(started.wait(), timeout=1)
    assert await registry.pause("plain-run") is True
    events = await asyncio.wait_for(run_task, timeout=1)
    registry.unregister("plain-run", control)

    assert cancelled.is_set()
    assert [event.type for event in events] == ["paused"]
