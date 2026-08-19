import asyncio
from pathlib import Path

from app.execution.retry import RetryPolicy
from app.execution.tool_call_executor import ToolCallExecutor
from app.execution.tool_result_processor import ToolResultProcessor
from app.harness.contracts import ProviderToolCall
from app.model.model_connection_settings import ModelConnectionSettings
from app.permission.broker import ApprovalBroker
from app.permission.config_store import PermissionConfigStore
from app.permission.engine import PermissionEngine
from app.permission.model import PermissionMode, PermissionPolicy
from app.tool.base import ToolContext, ToolResult, function_tool
from app.tool.registry import ToolRegistry


def test_read_only_tool_retries_transient_errors_with_stable_effect_id(
    tmp_path: Path,
) -> None:
    async def scenario():
        attempts = 0

        async def execute(_context, _input):
            nonlocal attempts
            attempts += 1
            if attempts < 3:
                raise TimeoutError("temporary")
            return ToolResult("ok")

        executor = _executor(tmp_path, execute, read_only=True)
        pairs = [
            pair
            async for pair in executor.execute(
                ProviderToolCall("call-retry", "probe", "{}"),
                ToolContext(
                    tmp_path.resolve(),
                    correlation_id="run-1",
                    session_id="session-1",
                ),
                "model",
                _settings(),
                PermissionPolicy(mode=PermissionMode.FULL_ACCESS),
                0,
            )
        ]
        return attempts, pairs

    attempts, pairs = asyncio.run(scenario())
    events = [event for event, _result in pairs]
    assert attempts == 3
    assert [event.type for event in events] == [
        "tool_started",
        "progress_message",
        "progress_message",
        "tool_completed",
    ]
    assert events[-1].metadata["attempt"] == 3
    assert events[-1].metadata["toolExecutionState"] == "completed"
    assert events[0].metadata["effectId"] == events[-1].metadata["effectId"]


def test_mutating_tool_does_not_retry_when_commit_state_is_unknown(
    tmp_path: Path,
) -> None:
    async def scenario():
        attempts = 0

        async def execute(_context, _input):
            nonlocal attempts
            attempts += 1
            raise TimeoutError("commit status unknown")

        executor = _executor(tmp_path, execute, read_only=False)
        pairs = [
            pair
            async for pair in executor.execute(
                ProviderToolCall("call-write", "probe", "{}"),
                ToolContext(
                    tmp_path.resolve(),
                    correlation_id="run-1",
                    session_id="session-1",
                ),
                "model",
                _settings(),
                PermissionPolicy(mode=PermissionMode.FULL_ACCESS),
                0,
            )
        ]
        return attempts, pairs

    attempts, pairs = asyncio.run(scenario())
    terminal = pairs[-1][0]
    assert attempts == 1
    assert terminal.type == "tool_failed"
    assert terminal.metadata["retryable"] is False
    assert terminal.metadata["toolExecutionState"] == "unknown"


def test_read_only_control_tool_can_disable_automatic_replay(
    tmp_path: Path,
) -> None:
    async def scenario():
        attempts = 0

        async def execute(_context, _input):
            nonlocal attempts
            attempts += 1
            raise TimeoutError("child effect status unknown")

        executor = _executor(
            tmp_path,
            execute,
            read_only=True,
            retry_safe=False,
        )
        pairs = [
            pair
            async for pair in executor.execute(
                ProviderToolCall("call-control", "probe", "{}"),
                ToolContext(tmp_path.resolve(), session_id="session-1"),
                "model",
                _settings(),
                PermissionPolicy(mode=PermissionMode.FULL_ACCESS),
                0,
            )
        ]
        return attempts, pairs

    attempts, pairs = asyncio.run(scenario())
    assert attempts == 1
    assert pairs[-1][0].metadata["toolExecutionState"] == "unknown"


def _executor(
    tmp_path: Path,
    execute,
    *,
    read_only: bool,
    retry_safe: bool | None = None,
) -> ToolCallExecutor:
    tool = function_tool(
        name="probe",
        description="probe",
        input_schema={
            "type": "object",
            "properties": {},
            "additionalProperties": False,
        },
        execute=execute,
        read_only=read_only,
        retry_safe=retry_safe,
    )
    return ToolCallExecutor(
        ToolRegistry((tool,)),
        PermissionEngine(),
        ApprovalBroker(),
        PermissionConfigStore(tmp_path / "home"),
        ToolResultProcessor(),
        retry_policy=RetryPolicy(
            max_attempts=3,
            base_delay_seconds=0,
            max_delay_seconds=0,
            jitter_ratio=0,
        ),
    )


def _settings() -> ModelConnectionSettings:
    return ModelConnectionSettings(
        "test",
        "https://example.com",
        "model",
        "key",
    )
