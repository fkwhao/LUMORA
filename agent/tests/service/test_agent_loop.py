import asyncio
from pathlib import Path

from app.artifact.store import ArtifactStore
from app.dto.request.chat_completion_request import ChatMessageRequest
from app.dto.response.chat_completion_response import (
    ChatCompletionResponse,
    TokenUsageResponse,
)
from app.execution.tool_result_processor import ToolResultProcessor
from app.harness.agent_loop import AgentLoopRunner
from app.harness.contracts import (
    ProviderToolCall,
    ProviderTurn,
    ProviderTurnEvent,
)
from app.model.model_connection_settings import ModelConnectionSettings
from app.prompt.prompt_assembly import PromptAssembly
from app.tool.base import ToolContext, ToolResult, function_tool
from app.tool.registry import ToolRegistry


def test_agent_loop_externalizes_when_aggregate_result_limit_is_crossed(
    tmp_path: Path,
) -> None:
    result = ToolResultProcessor().process(
        "read_file",
        "call-aggregate",
        ToolResult("x" * 30_000),
        ToolContext(
            workspace_path=tmp_path,
            task_id="task-1",
            artifact_store=ArtifactStore(tmp_path / "artifacts"),
        ),
        inline_result_chars=180_000,
    )

    assert len(result.content) < 30_000
    assert result.metadata["artifactId"].startswith("art_")
    assert "artifact_read" in result.content


def test_agent_loop_truncates_non_artifact_output_for_model_safety(
    tmp_path: Path,
) -> None:
    result = ToolResultProcessor().process(
        "read_file",
        "call-truncate",
        ToolResult("a" * 45_000),
        ToolContext(workspace_path=tmp_path),
    )

    assert result.metadata["modelOutputTruncated"] is True
    assert result.metadata["originalCharacterCount"] == 45_000
    assert "中间省略" in result.content
    assert len(result.content) < 41_000


def _settings() -> ModelConnectionSettings:
    return ModelConnectionSettings(
        provider_name="test",
        base_url="https://example.com/v1",
        model="test-model",
        api_key="secret",
    )


def test_agent_loop_streams_tool_lifecycle_before_final_answer() -> None:
    asyncio.run(_assert_tool_lifecycle_before_final_answer())


def test_agent_loop_forwards_final_answer_deltas_in_tool_mode() -> None:
    asyncio.run(_assert_final_answer_deltas_are_forwarded())


async def _assert_final_answer_deltas_are_forwarded() -> None:
    deltas = (
        "这是项目模式下的第一段流式回答，",
        "接下来继续输出第二段内容，",
        "这里还有第三段内容用于跨过分类缓冲，",
        "第四段会作为后续可见增量继续输出，",
        "最后完成。",
    )

    async def complete_turn(*_args):
        raise AssertionError("存在流式回合能力时不应调用一次性完成接口")

    async def stream_turn(*_args):
        for delta in deltas:
            yield ProviderTurnEvent(
                type="content_delta",
                delta=delta,
                model="test-model",
            )
        yield ProviderTurnEvent(
            type="completed",
            model="test-model",
            turn=ProviderTurn(
                content="".join(deltas),
                reasoning="",
                model="test-model",
                usage=TokenUsageResponse(
                    promptTokens=8,
                    completionTokens=6,
                    totalTokens=14,
                ),
                tool_calls=(),
            ),
        )

    events = [
        event
        async for event in AgentLoopRunner(
            complete_turn,
            stream_turn=stream_turn,
        ).stream(
            _settings(),
            PromptAssembly(()),
            [ChatMessageRequest(role="user", content="继续")],
            None,
            ToolRegistry(),
            ToolContext(Path(".")),
        )
    ]

    text_events = [event for event in events if event.type == "text_delta"]
    assert len(text_events) >= 2
    assert "".join(event.delta for event in text_events) == "".join(deltas)
    assert events[-2].type == "usage"
    assert events[-1].type == "completed"


async def _assert_tool_lifecycle_before_final_answer() -> None:
    turns = iter((
        ProviderTurn(
            content="我先读取文件。",
            reasoning="",
            model="test-model",
            usage=TokenUsageResponse(
                promptTokens=10,
                completionTokens=2,
                totalTokens=12,
            ),
            tool_calls=(ProviderToolCall("call-1", "read_file", "{}"),),
        ),
        ProviderTurn(
            content="读取完成。",
            reasoning="",
            model="test-model",
            usage=TokenUsageResponse(
                promptTokens=15,
                completionTokens=3,
                totalTokens=18,
            ),
            tool_calls=(),
        ),
    ))
    captured_messages: list[list[dict[str, object]]] = []

    async def complete_turn(settings, messages, tools, reasoning_effort):
        captured_messages.append(list(messages))
        return next(turns)

    async def execute(_context, _input):
        return ToolResult("文件内容")

    registry = ToolRegistry((
        function_tool(
            name="read_file",
            description="读取文件",
            input_schema={
                "type": "object",
                "properties": {},
                "additionalProperties": False,
            },
            execute=execute,
            read_only=True,
        ),
    ))
    events = [
        event
        async for event in AgentLoopRunner(complete_turn).stream(
            _settings(),
            PromptAssembly(()),
            [ChatMessageRequest(role="user", content="读取")],
            None,
            registry,
            ToolContext(Path(".")),
        )
    ]

    assert [event.type for event in events] == [
        "progress_message",
        "usage",
        "tool_started",
        "tool_completed",
        "usage",
        "text_delta",
        "usage",
        "completed",
    ]
    assert events[3].output == "文件内容"
    usage_events = [event for event in events if event.type == "usage"]
    assert [event.usage.total_tokens for event in usage_events if event.usage] == [
        12,
        12,
        30,
    ]
    assert usage_events[0].active_context_tokens == 10
    assert usage_events[1].active_context_tokens > 10
    assert usage_events[2].active_context_tokens == 15
    assert captured_messages[1][-1]["role"] == "tool"
    assert "文件内容" in str(captured_messages[1][-1]["content"])


def test_agent_loop_reports_invalid_tool_arguments() -> None:
    asyncio.run(_assert_invalid_tool_arguments_are_reported())


async def _assert_invalid_tool_arguments_are_reported() -> None:
    turns = iter((
        ProviderTurn(
            content="",
            reasoning="",
            model="test-model",
            usage=TokenUsageResponse(
                promptTokens=1,
                completionTokens=1,
                totalTokens=2,
            ),
            tool_calls=(ProviderToolCall("call-1", "read_file", "["),),
        ),
        ProviderTurn(
            content="参数有误。",
            reasoning="",
            model="test-model",
            usage=TokenUsageResponse(
                promptTokens=1,
                completionTokens=1,
                totalTokens=2,
            ),
            tool_calls=(),
        ),
    ))

    async def complete_turn(settings, messages, tools, reasoning_effort):
        return next(turns)

    events = [
        event
        async for event in AgentLoopRunner(complete_turn).stream(
            _settings(),
            PromptAssembly(()),
            [ChatMessageRequest(role="user", content="读取")],
            None,
            ToolRegistry(),
            ToolContext(Path(".")),
        )
    ]

    failed = next(event for event in events if event.type == "tool_failed")
    assert failed.arguments == {}
    assert events[-1].type == "completed"


def test_agent_loop_compacts_mid_turn_after_tool_growth() -> None:
    asyncio.run(_assert_agent_loop_compacts_mid_turn())


async def _assert_agent_loop_compacts_mid_turn() -> None:
    turns = iter((
        ProviderTurn(
            content="",
            reasoning="",
            model="test-model",
            usage=TokenUsageResponse(
                promptTokens=11_000,
                completionTokens=100,
                totalTokens=11_100,
            ),
            tool_calls=(ProviderToolCall("call-1", "large", "{}"),),
        ),
        ProviderTurn(
            content="完成。",
            reasoning="",
            model="test-model",
            usage=TokenUsageResponse(
                promptTokens=3_000,
                completionTokens=20,
                totalTokens=3_020,
            ),
            tool_calls=(),
        ),
    ))
    compacted_batches: list[list[dict[str, object]]] = []

    async def complete_turn(settings, messages, tools, reasoning_effort):
        return next(turns)

    async def compact_history(settings, messages, existing_summary):
        compacted_batches.append(messages)
        return ChatCompletionResponse(
            message="中途摘要",
            model="test-model",
            usage=TokenUsageResponse(
                promptTokens=500,
                completionTokens=100,
                totalTokens=600,
            ),
        )

    async def execute(_context, _input):
        return ToolResult("x" * 20_000)

    registry = ToolRegistry((
        function_tool(
            name="large",
            description="large",
            input_schema={"type": "object", "properties": {}},
            execute=execute,
            read_only=True,
        ),
    ))
    messages = [
        ChatMessageRequest(
            role="user" if index % 2 else "assistant",
            content=f"history-{index}-" + "h" * 6_000,
        )
        for index in range(1, 8)
    ]
    settings = ModelConnectionSettings(
        provider_name="test",
        base_url="https://example.com/v1",
        model="test-model",
        api_key="secret",
        context_window=20_000,
        max_output_tokens=2_000,
    )

    events = [
        event
        async for event in AgentLoopRunner(
            complete_turn,
            compact_history,
            lambda summary: PromptAssembly(()),
        ).stream(
            settings,
            PromptAssembly(()),
            messages,
            None,
            registry,
            ToolContext(Path(".")),
        )
    ]

    assert compacted_batches
    assert "context_compaction_started" in [event.type for event in events]
    compacted = next(event for event in events if event.type == "context_compacted")
    assert compacted.metadata["phase"] == "mid_turn"
    assert events[-1].type == "completed"
