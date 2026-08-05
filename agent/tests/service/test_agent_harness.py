import asyncio
from pathlib import Path

from app.dto.request.chat_completion_request import ChatMessageRequest
from app.dto.response.chat_completion_response import TokenUsageResponse
from app.harness.agent_harness import AgentHarness
from app.harness.contracts import ProviderTurn
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
        )
    ]


def test_harness_uses_native_stream_strategy_without_tools() -> None:
    provider = StrategyRecordingProvider()
    events = asyncio.run(
        _collect(AgentHarness(provider), PromptAssembly(()), None)  # type: ignore[arg-type]
    )

    assert [event.type for event in events] == ["text_delta", "usage", "completed"]
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

    assert [event.type for event in events] == ["text_delta", "usage", "completed"]
    assert events[0].delta == "工具模式回答"
    assert provider.stream_calls == 0
    assert provider.turn_calls == 1
