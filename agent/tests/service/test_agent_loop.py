import asyncio
from pathlib import Path

from app.dto.request.chat_completion_request import ChatMessageRequest
from app.dto.response.chat_completion_response import TokenUsageResponse
from app.model.model_connection_settings import ModelConnectionSettings
from app.prompt.prompt_assembly import PromptAssembly
from app.provider.agent_loop import (
    AgentLoopRunner,
    ProviderToolCall,
    ProviderTurn,
)
from app.tool.base import ToolContext, ToolResult, function_tool
from app.tool.registry import ToolRegistry


def _settings() -> ModelConnectionSettings:
    return ModelConnectionSettings(
        provider_name="test",
        base_url="https://example.com/v1",
        model="test-model",
        api_key="secret",
    )


def test_agent_loop_streams_tool_lifecycle_before_final_answer() -> None:
    asyncio.run(_assert_tool_lifecycle_before_final_answer())


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
        "tool_started",
        "tool_completed",
        "text_delta",
        "usage",
        "completed",
    ]
    assert events[2].output == "文件内容"
    assert events[4].usage is not None
    assert events[4].usage.total_tokens == 30
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

    assert events[0].type == "tool_failed"
    assert events[0].arguments == {}
    assert events[-1].type == "completed"
