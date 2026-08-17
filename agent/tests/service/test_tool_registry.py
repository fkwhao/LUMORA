import asyncio
import threading
from pathlib import Path

import pytest
from app.tool import (
    ResourceAccess,
    ResourceAccessMode,
    ToolCategory,
    ToolContext,
    ToolInputError,
    ToolRegistry,
    ToolResult,
    function_tool,
)


def sample_tool():
    return function_tool(
        name="echo",
        description="返回输入内容",
        input_schema={
            "type": "object",
            "properties": {"text": {"type": "string"}},
            "required": ["text"],
            "additionalProperties": False,
        },
        category=ToolCategory.OTHER,
        read_only=True,
        concurrency_safe=True,
        execute=lambda _context, data: ToolResult(content=str(data["text"])),
        title=lambda data: f"Echo {data['text']}",
    )


def test_registry_is_the_source_of_model_definitions() -> None:
    registry = ToolRegistry((sample_tool(),))

    definitions = registry.model_definitions()

    assert registry.names() == ("echo",)
    assert definitions[0]["function"]["name"] == "echo"
    assert definitions[0]["function"]["parameters"]["required"] == ["text"]


def test_registry_rejects_duplicate_names_and_invalid_input() -> None:
    registry = ToolRegistry((sample_tool(),))
    with pytest.raises(ValueError, match="重复"):
        registry.register(sample_tool())

    context = ToolContext(workspace_path=Path.cwd())
    with pytest.raises(ToolInputError, match="缺少必填参数"):
        asyncio.run(registry.execute("echo", context, {}))


def test_registry_adds_policy_and_duration_metadata() -> None:
    registry = ToolRegistry((sample_tool(),))
    context = ToolContext(workspace_path=Path.cwd())

    result = asyncio.run(
        registry.execute("echo", context, {"text": "hello"})
    )

    assert result.content == "hello"
    assert result.metadata["readOnly"] is True
    assert result.metadata["destructive"] is False
    assert result.metadata["category"] == "other"
    assert result.metadata["title"] == "Echo hello"
    assert int(result.metadata["durationMs"]) >= 1
    assert result.metadata["resourceContended"] is False
    assert result.metadata["resourceContendedKeys"] == ()


def test_copied_registries_share_exclusive_resource_locks() -> None:
    async def scenario() -> None:
        first_entered = asyncio.Event()
        second_entered = asyncio.Event()
        release_first = asyncio.Event()

        async def execute(_context, data):
            if data["text"] == "first":
                first_entered.set()
                await release_first.wait()
            else:
                second_entered.set()
            return ToolResult(content=str(data["text"]))

        tool = function_tool(
            name="locked",
            description="独占资源测试",
            input_schema={
                "type": "object",
                "properties": {"text": {"type": "string"}},
                "required": ["text"],
                "additionalProperties": False,
            },
            execute=execute,
            resource_accesses=lambda _context, _data: (
                ResourceAccess("file:shared", ResourceAccessMode.WRITE),
            ),
        )
        registry = ToolRegistry((tool,))
        first_registry = registry.copy()
        second_registry = registry.copy()
        context = ToolContext(workspace_path=Path.cwd())

        first = asyncio.create_task(
            first_registry.execute("locked", context, {"text": "first"})
        )
        await first_entered.wait()
        second = asyncio.create_task(
            second_registry.execute("locked", context, {"text": "second"})
        )
        await asyncio.sleep(0)

        assert second_entered.is_set() is False
        release_first.set()
        first_result, second_result = await asyncio.gather(first, second)
        assert second_entered.is_set() is True
        assert first_result.metadata["resourceContended"] is False
        assert first_result.metadata["resourceContendedKeys"] == ()
        assert second_result.metadata["resourceContended"] is True
        assert second_result.metadata["resourceContendedKeys"] == (
            "file:shared",
        )

    asyncio.run(scenario())


def test_resource_read_locks_allow_concurrent_readers() -> None:
    async def scenario() -> None:
        entered = 0
        both_entered = asyncio.Event()
        release = asyncio.Event()

        async def execute(_context, _data):
            nonlocal entered
            entered += 1
            if entered == 2:
                both_entered.set()
            await release.wait()
            return ToolResult(content="read")

        tool = function_tool(
            name="reader",
            description="共享资源读取测试",
            input_schema={
                "type": "object",
                "properties": {},
                "additionalProperties": False,
            },
            execute=execute,
            resource_accesses=lambda _context, _data: (
                ResourceAccess("file:shared", ResourceAccessMode.READ),
            ),
        )
        registry = ToolRegistry((tool,))
        context = ToolContext(workspace_path=Path.cwd())
        first = asyncio.create_task(registry.copy().execute("reader", context, {}))
        second = asyncio.create_task(registry.copy().execute("reader", context, {}))

        await asyncio.wait_for(both_entered.wait(), timeout=1)
        release.set()
        await asyncio.gather(first, second)

    asyncio.run(scenario())


def test_cancelled_resource_waiter_does_not_execute_after_lock_release() -> None:
    async def scenario() -> None:
        first_entered = asyncio.Event()
        second_entered = asyncio.Event()
        release_first = asyncio.Event()
        cancelled = False

        async def execute(_context, data):
            if data["text"] == "first":
                first_entered.set()
                await release_first.wait()
            else:
                second_entered.set()
            return ToolResult(content=str(data["text"]))

        tool = function_tool(
            name="locked_cancel",
            description="资源等待取消测试",
            input_schema={
                "type": "object",
                "properties": {"text": {"type": "string"}},
                "required": ["text"],
                "additionalProperties": False,
            },
            execute=execute,
            resource_accesses=lambda _context, _data: (
                ResourceAccess("file:shared", ResourceAccessMode.WRITE),
            ),
        )
        registry = ToolRegistry((tool,))
        first_context = ToolContext(workspace_path=Path.cwd())
        second_context = ToolContext(
            workspace_path=Path.cwd(),
            cancelled=lambda: cancelled,
        )

        first = asyncio.create_task(
            registry.execute("locked_cancel", first_context, {"text": "first"})
        )
        await first_entered.wait()
        second = asyncio.create_task(
            registry.copy().execute(
                "locked_cancel", second_context, {"text": "second"}
            )
        )
        await asyncio.sleep(0)
        cancelled = True
        release_first.set()
        await first
        with pytest.raises(asyncio.CancelledError):
            await second
        assert second_entered.is_set() is False

    asyncio.run(scenario())


def test_synchronous_safe_tools_run_concurrently_off_the_event_loop() -> None:
    async def scenario() -> None:
        barrier = threading.Barrier(2)

        def execute(_context, data):
            barrier.wait(timeout=1)
            return ToolResult(content=str(data["text"]))

        tool = function_tool(
            name="sync_parallel",
            description="同步工具并发测试",
            input_schema={
                "type": "object",
                "properties": {"text": {"type": "string"}},
                "required": ["text"],
                "additionalProperties": False,
            },
            execute=execute,
            read_only=True,
            concurrency_safe=True,
        )
        registry = ToolRegistry((tool,))
        context = ToolContext(workspace_path=Path.cwd())

        first, second = await asyncio.gather(
            registry.execute("sync_parallel", context, {"text": "first"}),
            registry.execute("sync_parallel", context, {"text": "second"}),
        )

        assert {first.content, second.content} == {"first", "second"}

    asyncio.run(scenario())
