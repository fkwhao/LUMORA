import asyncio
from pathlib import Path

import httpx
import pytest

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


def test_agent_loop_resets_provisional_answer_before_final_stream() -> None:
    asyncio.run(_assert_provisional_answer_is_reset())


def test_agent_loop_preserves_provisional_answer_as_stage_content() -> None:
    asyncio.run(_assert_provisional_answer_becomes_stage_content())


def test_agent_loop_does_not_duplicate_stage_content_before_tool() -> None:
    asyncio.run(_assert_stage_content_is_not_duplicated_before_tool())


def test_agent_loop_moves_streamed_tool_preamble_to_progress() -> None:
    asyncio.run(_assert_streamed_tool_preamble_becomes_progress())


def test_agent_loop_supports_more_than_twenty_tool_iterations() -> None:
    asyncio.run(_assert_long_task_exceeds_old_iteration_limit())


def test_agent_loop_stops_identical_no_progress_iterations() -> None:
    asyncio.run(_assert_identical_tool_iterations_are_stopped())


def test_agent_loop_retries_transient_stream_disconnect() -> None:
    asyncio.run(_assert_transient_stream_disconnect_is_retried())


async def _assert_transient_stream_disconnect_is_retried() -> None:
    interrupted = (
        "我已经拿到 Maven 的失败输出，正在分析 Wrapper 下载失败的原因，"
        "接下来会改用本地缓存继续验证。"
    )
    final = "已从瞬时断连中恢复，并继续处理 Maven 失败。"
    attempts = 0

    async def complete_turn(*_args):
        raise AssertionError("存在流式回合能力时不应调用一次性完成接口")

    async def stream_turn(*_args):
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            yield ProviderTurnEvent(
                type="content_delta",
                delta=interrupted,
                model="test-model",
            )
            raise httpx.RemoteProtocolError("incomplete chunked read")
        turn = ProviderTurn(
            content=final,
            reasoning="",
            model="test-model",
            usage=TokenUsageResponse(
                promptTokens=20,
                completionTokens=8,
                totalTokens=28,
            ),
            tool_calls=(),
        )
        yield ProviderTurnEvent(
            type="content_delta",
            delta=final,
            model=turn.model,
        )
        yield ProviderTurnEvent(
            type="completed",
            model=turn.model,
            turn=turn,
        )

    events = [
        event
        async for event in AgentLoopRunner(
            complete_turn,
            stream_turn=stream_turn,
            stream_retry_base_delay=0,
        ).stream(
            _settings(),
            PromptAssembly(()),
            [ChatMessageRequest(role="user", content="继续完成项目")],
            None,
            ToolRegistry(),
            ToolContext(Path(".")),
        )
    ]

    reset_index = next(
        index for index, event in enumerate(events) if event.type == "text_reset"
    )
    assert attempts == 2
    assert interrupted == "".join(
        event.delta for event in events[:reset_index] if event.type == "text_delta"
    )
    assert final == "".join(
        event.delta for event in events[reset_index + 1 :] if event.type == "text_delta"
    )
    assert any(
        event.type == "progress_message" and "自动重试" in event.delta
        for event in events
    )
    assert events[-1].type == "completed"


async def _assert_streamed_tool_preamble_becomes_progress() -> None:
    preamble = (
        "本机环境已经检查完成，接下来我会补充 Maven Wrapper，"
        "然后继续执行项目测试并根据结果修复问题。"
    )
    final = "Maven Wrapper 已补充，项目测试也已经通过。"
    turns = iter((
        ProviderTurn(
            content=preamble,
            reasoning="",
            model="test-model",
            usage=TokenUsageResponse(
                promptTokens=10,
                completionTokens=8,
                totalTokens=18,
            ),
            tool_calls=(ProviderToolCall("call-1", "run_step", "{}"),),
        ),
        ProviderTurn(
            content=final,
            reasoning="",
            model="test-model",
            usage=TokenUsageResponse(
                promptTokens=20,
                completionTokens=6,
                totalTokens=26,
            ),
            tool_calls=(),
        ),
    ))

    async def complete_turn(*_args):
        raise AssertionError("存在流式回合能力时不应调用一次性完成接口")

    async def stream_turn(*_args):
        turn = next(turns)
        yield ProviderTurnEvent(
            type="content_delta",
            delta=turn.content,
            model=turn.model,
        )
        if turn.tool_calls:
            yield ProviderTurnEvent(
                type="tool_call_delta",
                model=turn.model,
            )
        yield ProviderTurnEvent(
            type="completed",
            model=turn.model,
            turn=turn,
        )

    async def execute(_context, _input):
        return ToolResult("done")

    registry = ToolRegistry((
        function_tool(
            name="run_step",
            description="运行步骤",
            input_schema={"type": "object", "properties": {}},
            execute=execute,
            read_only=True,
        ),
    ))
    events = [
        event
        async for event in AgentLoopRunner(
            complete_turn,
            stream_turn=stream_turn,
        ).stream(
            _settings(),
            PromptAssembly(()),
            [ChatMessageRequest(role="user", content="完成项目")],
            None,
            registry,
            ToolContext(Path(".")),
        )
    ]

    reset_index = next(
        index for index, event in enumerate(events) if event.type == "text_reset"
    )
    assert preamble == "".join(
        event.delta for event in events[:reset_index] if event.type == "text_delta"
    )
    assert final == "".join(
        event.delta for event in events[reset_index + 1 :] if event.type == "text_delta"
    )
    progress = [event.delta for event in events if event.type == "progress_message"]
    assert progress == [preamble]
    progress_index = next(
        index
        for index, event in enumerate(events)
        if event.type == "progress_message"
    )
    assert progress_index < reset_index
    assert events[progress_index].metadata["replacesAssistantContent"] is True


async def _assert_long_task_exceeds_old_iteration_limit() -> None:
    tool_turns = tuple(
        ProviderTurn(
            content=f"执行第 {step} 步。",
            reasoning="",
            model="test-model",
            usage=TokenUsageResponse(
                promptTokens=step,
                completionTokens=1,
                totalTokens=step + 1,
            ),
            tool_calls=(ProviderToolCall(
                f"call-{step}",
                "run_step",
                f'{{"step":{step}}}',
            ),),
        )
        for step in range(1, 22)
    )
    turns = iter((*tool_turns, ProviderTurn(
        content="长任务完成。",
        reasoning="",
        model="test-model",
        usage=TokenUsageResponse(
            promptTokens=30,
            completionTokens=3,
            totalTokens=33,
        ),
        tool_calls=(),
    )))
    executed_steps: list[int] = []

    async def complete_turn(*_args):
        return next(turns)

    async def execute(_context, input_data):
        step = int(input_data["step"])
        executed_steps.append(step)
        return ToolResult(f"step {step} done")

    registry = ToolRegistry((
        function_tool(
            name="run_step",
            description="运行步骤",
            input_schema={
                "type": "object",
                "properties": {"step": {"type": "integer"}},
                "required": ["step"],
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
            [ChatMessageRequest(role="user", content="完成长任务")],
            None,
            registry,
            ToolContext(Path(".")),
        )
    ]

    assert executed_steps == list(range(1, 22))
    assert events[-1].type == "completed"


async def _assert_identical_tool_iterations_are_stopped() -> None:
    turns = iter(
        ProviderTurn(
            content="再次读取。",
            reasoning="",
            model="test-model",
            usage=TokenUsageResponse(
                promptTokens=10,
                completionTokens=1,
                totalTokens=11,
            ),
            tool_calls=(ProviderToolCall("call", "read_same", "{}"),),
        )
        for _ in range(4)
    )

    async def complete_turn(*_args):
        return next(turns)

    async def execute(_context, _input):
        return ToolResult("unchanged")

    registry = ToolRegistry((
        function_tool(
            name="read_same",
            description="读取相同内容",
            input_schema={"type": "object", "properties": {}},
            execute=execute,
            read_only=True,
        ),
    ))

    with pytest.raises(ValueError, match="无进展循环"):
        _events = [
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


async def _assert_stage_content_is_not_duplicated_before_tool() -> None:
    stage = "我先读取项目配置，再继续处理。"
    call = ProviderToolCall(
        call_id="read-1",
        name="read_file",
        arguments_json="{}",
    )
    turns = iter((
        ProviderTurn(
            content=stage,
            reasoning="",
            model="test-model",
            usage=TokenUsageResponse(
                promptTokens=4,
                completionTokens=3,
                totalTokens=7,
            ),
            tool_calls=(call,),
        ),
        ProviderTurn(
            content="处理完成。",
            reasoning="",
            model="test-model",
            usage=TokenUsageResponse(
                promptTokens=6,
                completionTokens=2,
                totalTokens=8,
            ),
            tool_calls=(),
        ),
    ))

    async def complete_turn(*_args):
        raise AssertionError("存在流式回合能力时不应调用一次性完成接口")

    async def stream_turn(*_args):
        turn = next(turns)
        if turn.tool_calls:
            yield ProviderTurnEvent(
                type="stage_content",
                delta=stage,
                item_id="stage-tool",
                model="test-model",
            )
            yield ProviderTurnEvent(type="tool_call_delta", model="test-model")
        else:
            yield ProviderTurnEvent(
                type="content_delta",
                delta=turn.content,
                model="test-model",
            )
        yield ProviderTurnEvent(type="completed", model="test-model", turn=turn)

    async def execute(_context, _input):
        return ToolResult("配置内容")

    registry = ToolRegistry((
        function_tool(
            name="read_file",
            description="读取文件",
            input_schema={"type": "object", "properties": {}},
            execute=execute,
            read_only=True,
        ),
    ))
    events = [
        event
        async for event in AgentLoopRunner(
            complete_turn,
            stream_turn=stream_turn,
        ).stream(
            _settings(),
            PromptAssembly(()),
            [ChatMessageRequest(role="user", content="读取配置")],
            None,
            registry,
            ToolContext(Path(".")),
        )
    ]

    progress = [event for event in events if event.type == "progress_message"]
    assert len(progress) == 1
    assert progress[0].delta == stage


async def _assert_provisional_answer_becomes_stage_content() -> None:
    stage = (
        "我已经找到第一批资料，但还需要继续核实官方页面，"
        "这段内容应当保留在处理步骤中。"
    )
    final = "这是后续检索完成后的最终答案。"

    async def complete_turn(*_args):
        raise AssertionError("存在流式回合能力时不应调用一次性完成接口")

    async def stream_turn(*_args):
        yield ProviderTurnEvent(
            type="content_delta",
            delta=stage,
            model="test-model",
        )
        yield ProviderTurnEvent(
            type="stage_content",
            delta=stage,
            item_id="stage-1",
            model="test-model",
        )
        yield ProviderTurnEvent(
            type="content_delta",
            delta=final,
            model="test-model",
        )
        yield ProviderTurnEvent(
            type="completed",
            model="test-model",
            turn=ProviderTurn(
                content=final,
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

    progress = next(event for event in events if event.type == "progress_message")
    assert progress.item_id == "stage-1"
    assert progress.delta == stage
    assert [event.type for event in events].count("text_reset") == 1
    reset_index = next(
        index for index, event in enumerate(events) if event.type == "text_reset"
    )
    assert final == "".join(
        event.delta for event in events[reset_index + 1 :] if event.type == "text_delta"
    )


async def _assert_provisional_answer_is_reset() -> None:
    provisional = (
        "这是一段足够长、会跨过分类缓冲并显示出来的临时搜索结论，"
        "随后模型仍然决定继续进行下一轮网络搜索。"
    )
    final = (
        "这是重新搜索后的最终回答，它同样足够长并且会以流式方式显示出来，"
        "同时不会保留前面尚未确认的临时结论。"
    )

    async def complete_turn(*_args):
        raise AssertionError("存在流式回合能力时不应调用一次性完成接口")

    async def stream_turn(*_args):
        yield ProviderTurnEvent(
            type="content_delta",
            delta=provisional,
            model="test-model",
        )
        yield ProviderTurnEvent(type="content_reset", model="test-model")
        yield ProviderTurnEvent(
            type="content_delta",
            delta=final,
            model="test-model",
        )
        yield ProviderTurnEvent(
            type="completed",
            model="test-model",
            turn=ProviderTurn(
                content=final,
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

    assert [event.type for event in events].count("text_reset") == 1
    reset_index = next(
        index for index, event in enumerate(events) if event.type == "text_reset"
    )
    assert provisional in "".join(
        event.delta for event in events[:reset_index] if event.type == "text_delta"
    )
    assert final == "".join(
        event.delta for event in events[reset_index + 1 :] if event.type == "text_delta"
    )


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


def test_agent_loop_replaces_provisional_usage_and_keeps_billed_retry() -> None:
    asyncio.run(_assert_provisional_usage_survives_retry())


async def _assert_provisional_usage_survives_retry() -> None:
    attempts = 0

    async def complete_turn(*_args):
        raise AssertionError("存在流式回合能力时不应调用一次性完成接口")

    async def stream_turn(*_args):
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            yield ProviderTurnEvent(
                type="usage",
                model="test-model",
                usage=TokenUsageResponse(
                    promptTokens=8,
                    completionTokens=2,
                    totalTokens=10,
                ),
                usage_estimated=True,
            )
            raise httpx.RemoteProtocolError("interrupted")
        yield ProviderTurnEvent(
            type="usage",
            model="test-model",
            usage=TokenUsageResponse(
                promptTokens=16,
                completionTokens=4,
                totalTokens=20,
            ),
        )
        yield ProviderTurnEvent(
            type="content_delta",
            delta="重试后完成。" * 4,
            model="test-model",
        )
        yield ProviderTurnEvent(
            type="completed",
            model="test-model",
            turn=ProviderTurn(
                content="重试后完成。" * 4,
                reasoning="",
                model="test-model",
                usage=TokenUsageResponse(
                    promptTokens=16,
                    completionTokens=6,
                    totalTokens=22,
                ),
                tool_calls=(),
            ),
        )

    events = [
        event
        async for event in AgentLoopRunner(
            complete_turn,
            stream_turn=stream_turn,
            stream_retry_base_delay=0,
        ).stream(
            _settings(),
            PromptAssembly(()),
            [ChatMessageRequest(role="user", content="继续")],
            None,
            ToolRegistry(),
            ToolContext(Path(".")),
        )
    ]
    usage_totals = [
        event.usage.total_tokens
        for event in events
        if event.type == "usage" and event.usage is not None
    ]

    assert attempts == 2
    assert usage_totals == [10, 30, 32]
    assert events[-2].usage is not None
    assert events[-2].metadata == {}


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
