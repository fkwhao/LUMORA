import asyncio
import os
import threading
from collections.abc import AsyncIterator, Iterable
from contextlib import asynccontextmanager
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path


class ResourceAccessMode(StrEnum):
    READ = "read"
    WRITE = "write"


@dataclass(frozen=True, slots=True)
class ResourceAccess:
    key: str
    mode: ResourceAccessMode


@dataclass(frozen=True, slots=True)
class ResourceLockReport:
    """Describes the normalized lock set and any real contention it met."""

    accesses: tuple[ResourceAccess, ...]
    contended_keys: tuple[str, ...]

    @property
    def contended(self) -> bool:
        return bool(self.contended_keys)


class _AsyncReadWriteLock:
    """Writer-preferring async read/write lock for one logical resource."""

    def __init__(self) -> None:
        self._condition = asyncio.Condition()
        self._readers = 0
        self._writer = False
        self._waiting_writers = 0

    async def acquire_read(self) -> bool:
        async with self._condition:
            contended = self._writer or self._waiting_writers > 0
            while self._writer or self._waiting_writers:
                await self._condition.wait()
            self._readers += 1
            return contended

    async def release_read(self) -> None:
        async with self._condition:
            self._readers -= 1
            if self._readers < 0:
                raise RuntimeError("资源读锁释放次数超过获取次数")
            if self._readers == 0:
                self._condition.notify_all()

    async def acquire_write(self) -> bool:
        async with self._condition:
            contended = (
                self._writer
                or self._readers > 0
                or self._waiting_writers > 0
            )
            self._waiting_writers += 1
            try:
                while self._writer or self._readers:
                    await self._condition.wait()
                self._writer = True
                return contended
            finally:
                self._waiting_writers -= 1
                # A cancelled writer must wake readers that were waiting behind it.
                self._condition.notify_all()

    async def release_write(self) -> None:
        async with self._condition:
            if not self._writer:
                raise RuntimeError("资源写锁尚未获取")
            self._writer = False
            self._condition.notify_all()


class ResourceLockManager:
    """Coordinates resource access across all concurrent Agent runs."""

    def __init__(self) -> None:
        self._locks: dict[str, _AsyncReadWriteLock] = {}

    @asynccontextmanager
    async def hold(
        self,
        accesses: Iterable[ResourceAccess],
    ) -> AsyncIterator[ResourceLockReport]:
        normalized = _normalize_accesses(accesses)
        acquired: list[tuple[_AsyncReadWriteLock, ResourceAccessMode]] = []
        contended_keys: list[str] = []
        try:
            # Stable ordering prevents deadlocks when a future tool needs >1 resource.
            for access in normalized:
                lock = self._locks.setdefault(access.key, _AsyncReadWriteLock())
                if access.mode == ResourceAccessMode.READ:
                    contended = await lock.acquire_read()
                else:
                    contended = await lock.acquire_write()
                if contended:
                    contended_keys.append(access.key)
                acquired.append((lock, access.mode))
            yield ResourceLockReport(
                accesses=normalized,
                contended_keys=tuple(contended_keys),
            )
        finally:
            for lock, mode in reversed(acquired):
                if mode == ResourceAccessMode.READ:
                    await lock.release_read()
                else:
                    await lock.release_write()


class ResourceObservationStore:
    """Tracks the last resource version observed by each logical task."""

    def __init__(self) -> None:
        self._versions: dict[tuple[str, str], str] = {}
        self._guard = threading.Lock()

    def observe(self, owner: str, resource_key: str, version: str) -> None:
        if owner:
            with self._guard:
                self._versions[(owner, resource_key)] = version

    def expected(self, owner: str, resource_key: str) -> str | None:
        if not owner:
            return None
        with self._guard:
            return self._versions.get((owner, resource_key))


def workspace_resource_key(path: Path) -> str:
    normalized = os.path.normcase(str(path.expanduser().resolve()))
    return f"workspace:{normalized}"


def file_resource_key(path: Path) -> str:
    normalized = os.path.normcase(str(path.expanduser().resolve()))
    return f"file:{normalized}"


def _normalize_accesses(
    accesses: Iterable[ResourceAccess],
) -> tuple[ResourceAccess, ...]:
    modes_by_key: dict[str, ResourceAccessMode] = {}
    for access in accesses:
        key = access.key.strip()
        if not key:
            raise ValueError("资源锁 key 不能为空")
        current = modes_by_key.get(key)
        if current is None or access.mode == ResourceAccessMode.WRITE:
            modes_by_key[key] = access.mode
    return tuple(
        ResourceAccess(key, modes_by_key[key])
        for key in sorted(modes_by_key)
    )
