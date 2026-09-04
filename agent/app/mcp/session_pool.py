import asyncio
import hashlib
import json
from collections import OrderedDict
from collections.abc import Callable
from dataclasses import dataclass

from app.mcp.client import McpClient
from app.mcp.model import McpServerConfig, McpToolDefinition


@dataclass(frozen=True, slots=True)
class McpSession:
    client: McpClient
    tools: tuple[McpToolDefinition, ...]


@dataclass(slots=True)
class _Entry:
    session: McpSession
    references: int = 0


class McpSessionLease:
    def __init__(
        self,
        pool: "McpSessionPool",
        key: str,
        session: McpSession,
    ) -> None:
        self.session = session
        self._pool = pool
        self._key = key
        self._released = False

    async def release(self) -> None:
        if self._released:
            return
        self._released = True
        await self._pool.release(self._key)


class McpSessionPool:
    """Bounded task-scoped MCP sessions reused across model turns."""

    def __init__(self, max_sessions: int = 64) -> None:
        self._max_sessions = max(1, max_sessions)
        self._entries: OrderedDict[str, _Entry] = OrderedDict()
        self._pending: dict[str, asyncio.Task[McpSession]] = {}
        self._lock = asyncio.Lock()

    async def acquire(
        self,
        task_scope: str,
        config: McpServerConfig,
        client_factory: Callable[[McpServerConfig], McpClient] = McpClient,
    ) -> McpSessionLease:
        key = _session_key(task_scope, config)
        async with self._lock:
            cached = self._entries.get(key)
            if cached is not None:
                cached.references += 1
                self._entries.move_to_end(key)
                return McpSessionLease(self, key, cached.session)
            pending = self._pending.get(key)
            if pending is None:
                pending = asyncio.create_task(
                    _connect_session(config, client_factory)
                )
                self._pending[key] = pending
        try:
            connected = await pending
        except BaseException:
            async with self._lock:
                if self._pending.get(key) is pending:
                    self._pending.pop(key, None)
            raise

        evicted: list[McpSession] = []
        async with self._lock:
            self._pending.pop(key, None)
            cached = self._entries.get(key)
            if cached is None:
                cached = _Entry(connected, references=1)
                self._entries[key] = cached
            else:
                cached.references += 1
            if cached.session is not connected:
                evicted.append(connected)
            self._entries.move_to_end(key)
            evicted.extend(self._trim_idle_locked())
        for session in evicted:
            await session.client.close()
        return McpSessionLease(self, key, cached.session)

    async def release(self, key: str) -> None:
        async with self._lock:
            entry = self._entries.get(key)
            if entry is not None:
                entry.references = max(0, entry.references - 1)
            evicted = self._trim_idle_locked()
        for session in evicted:
            await session.client.close()

    async def close(self) -> None:
        async with self._lock:
            pending = list(self._pending.values())
            self._pending.clear()
            sessions = [entry.session for entry in self._entries.values()]
            self._entries.clear()
        for task in pending:
            task.cancel()
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)
        for session in reversed(sessions):
            await session.client.close()

    def _trim_idle_locked(self) -> list[McpSession]:
        evicted: list[McpSession] = []
        while len(self._entries) > self._max_sessions:
            idle_key = next(
                (
                    key
                    for key, entry in self._entries.items()
                    if entry.references == 0
                ),
                None,
            )
            if idle_key is None:
                break
            evicted.append(self._entries.pop(idle_key).session)
        return evicted


async def _connect_session(
    config: McpServerConfig,
    client_factory: Callable[[McpServerConfig], McpClient],
) -> McpSession:
    client = client_factory(config)
    try:
        await client.connect()
        tools = await client.list_tools()
        return McpSession(client, tools)
    except BaseException:
        await client.close()
        raise


def _session_key(task_scope: str, config: McpServerConfig) -> str:
    payload = json.dumps(
        {
            "task": task_scope,
            "serverId": config.server_id,
            "name": config.name,
            "transport": config.transport,
            "url": config.url,
            "command": config.command,
            "arguments": config.arguments,
            "workingDirectory": config.working_directory,
            "environment": dict(config.environment),
            "enabled": config.enabled,
            "authType": config.auth_type,
            "headerName": config.header_name,
            "credential": config.credential,
        },
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()
