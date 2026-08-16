import asyncio

from app.harness.run_control import RunControlRegistry, await_or_pause


def test_pause_request_is_retained_before_stream_registration() -> None:
    asyncio.run(_assert_pending_pause_is_applied())


async def _assert_pending_pause_is_applied() -> None:
    registry = RunControlRegistry()
    accepted = await asyncio.wait_for(
        registry.pause("run-1"),
        timeout=0.05,
    )

    control = registry.register("run-1")
    assert accepted is True
    assert control.pause_requested is True

    registry.unregister("run-1", control)
    assert control.pause_requested is False


def test_pause_does_not_wait_indefinitely_for_provider_cleanup() -> None:
    asyncio.run(_assert_uncooperative_cleanup_is_bounded())


def test_steers_can_be_edited_until_the_safe_boundary_claim() -> None:
    asyncio.run(_assert_steer_lifecycle())


async def _assert_steer_lifecycle() -> None:
    registry = RunControlRegistry()
    assert await registry.add_steer("run-steer", "input-1", "先检查配置")
    control = registry.register("run-steer")

    assert await registry.replace_steer(
        "run-steer", "input-1", "先检查测试配置"
    )
    assert await registry.add_steer("run-steer", "input-2", "再运行测试")
    assert await registry.remove_steer("run-steer", "input-2")

    claimed = control.close_and_claim_steers()
    assert [(item.input_id, item.content) for item in claimed] == [
        ("input-1", "先检查测试配置")
    ]
    assert not await registry.add_steer(
        "run-steer", "input-late", "来得太晚"
    )
    registry.unregister("run-steer", control)


async def _assert_uncooperative_cleanup_is_bounded() -> None:
    registry = RunControlRegistry()
    control = registry.register("run-stalled-cleanup")
    started = asyncio.Event()
    release = asyncio.Event()

    async def stubborn_operation() -> str:
        started.set()
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            await release.wait()
            raise

    operation = asyncio.create_task(
        await_or_pause(stubborn_operation(), control)
    )
    await started.wait()
    await registry.pause("run-stalled-cleanup")
    paused, result = await asyncio.wait_for(operation, timeout=0.5)

    assert paused is True
    assert result is None

    release.set()
    await asyncio.sleep(0)
    registry.unregister("run-stalled-cleanup", control)
