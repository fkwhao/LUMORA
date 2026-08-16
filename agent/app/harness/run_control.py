import asyncio
import logging
from collections.abc import Awaitable
from typing import Any, TypeVar

_PAUSE_CANCELLATION_GRACE_SECONDS = 0.2
_PENDING_REGISTRATION_TTL_SECONDS = 30.0
_AwaitedValue = TypeVar("_AwaitedValue")
_LOGGER = logging.getLogger(__name__)


class RunControl:
    """Cooperative cancellation signal for one Agent turn.

    A logical run may contain multiple turns.  Pausing ends the current turn at
    a safe boundary; it never keeps a Python coroutine suspended in memory.
    """

    def __init__(self) -> None:
        self._registered = asyncio.Event()
        self._pause_requested = asyncio.Event()
        self._finished = False

    @property
    def pause_requested(self) -> bool:
        return self._pause_requested.is_set() and not self._finished

    @property
    def registered(self) -> bool:
        return self._registered.is_set()

    def mark_registered(self) -> None:
        if self._finished:
            raise RuntimeError("运行控制器已结束")
        self._registered.set()

    def mark_finished(self) -> None:
        self._finished = True
        self._pause_requested.set()

    def request_pause(self) -> bool:
        if self._finished:
            return False
        self._pause_requested.set()
        return True

    async def wait_until_pause_requested(self) -> None:
        await self._pause_requested.wait()


class RunControlRegistry:
    """Owns live controls without coupling run lifetime to an HTTP stream."""

    def __init__(self) -> None:
        self._controls: dict[str, RunControl] = {}
        self._pending_expirations: dict[str, asyncio.TimerHandle] = {}

    def register(self, run_id: str) -> RunControl:
        expiration = self._pending_expirations.pop(run_id, None)
        if expiration is not None:
            expiration.cancel()
        control = self._controls.get(run_id)
        if control is None:
            control = RunControl()
            self._controls[run_id] = control
        elif control.registered:
            raise ValueError("同一任务已有活动 Agent 运行")
        control.mark_registered()
        return control

    def unregister(self, run_id: str, control: RunControl) -> None:
        if self._controls.get(run_id) is not control:
            return
        expiration = self._pending_expirations.pop(run_id, None)
        if expiration is not None:
            expiration.cancel()
        control.mark_finished()
        self._controls.pop(run_id, None)

    async def pause(
        self,
        run_id: str,
    ) -> bool:
        control = self._controls.setdefault(run_id, RunControl())
        # Pause may arrive just before the streaming request registers.  Keep
        # the signal latched so registration observes it, but acknowledge the
        # trusted Core caller immediately instead of adding a fixed delay.
        accepted = control.request_pause()
        if (
            accepted
            and not control.registered
            and run_id not in self._pending_expirations
        ):
            self._pending_expirations[run_id] = (
                asyncio.get_running_loop().call_later(
                    _PENDING_REGISTRATION_TTL_SECONDS,
                    self._expire_pending,
                    run_id,
                    control,
                )
            )
        return accepted

    def _expire_pending(self, run_id: str, control: RunControl) -> None:
        self._pending_expirations.pop(run_id, None)
        if self._controls.get(run_id) is not control or control.registered:
            return
        control.mark_finished()
        self._controls.pop(run_id, None)


async def await_or_pause(
    awaitable: Awaitable[_AwaitedValue],
    run_control: RunControl | None,
) -> tuple[bool, _AwaitedValue | None]:
    """Race one cancellable awaitable against a turn pause signal.

    Cancellation is given a short grace period for normal HTTP cleanup.  An
    uncooperative provider cannot hold the pause response indefinitely; its
    eventual result is consumed in the background and is never published.
    """
    if run_control is None:
        return False, await awaitable
    operation_task = asyncio.ensure_future(awaitable)
    pause_task = asyncio.create_task(
        run_control.wait_until_pause_requested()
    )
    done, _pending = await asyncio.wait(
        {operation_task, pause_task},
        return_when=asyncio.FIRST_COMPLETED,
    )
    if operation_task in done:
        await _cancel_and_drain(pause_task)
        return False, operation_task.result()
    await _cancel_and_drain(operation_task)
    return True, None


async def _cancel_and_drain(task: asyncio.Future[Any]) -> None:
    if task.done():
        _consume_result(task)
        return
    task.cancel()
    done, _pending = await asyncio.wait(
        {task},
        timeout=_PAUSE_CANCELLATION_GRACE_SECONDS,
    )
    if done:
        _consume_result(task)
        return
    task.add_done_callback(_consume_result)


def _consume_result(task: asyncio.Future[Any]) -> None:
    try:
        task.result()
    except asyncio.CancelledError:
        return
    except Exception:
        _LOGGER.debug(
            "Paused operation finished with a suppressed error",
            exc_info=True,
        )
