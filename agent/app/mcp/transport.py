from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from pathlib import Path
from tempfile import TemporaryFile
from typing import BinaryIO, TextIO, cast

import httpx2
from mcp import Client as SdkClient
from mcp import StdioServerParameters, stdio_client
from mcp.client.streamable_http import streamable_http_client
from mcp.types import Implementation

from app.mcp.model import McpServerConfig

_CLIENT_INFO = Implementation(name="LUMORA", version="0.1.0")
_STDERR_TAIL_CHARS = 4_000
_REQUEST_TIMEOUT_SECONDS = 300.0


class McpTransport(ABC):
    """Own one SDK connection without tying cleanup to the caller's task.

    The SDK's transport contexts contain AnyIO cancel scopes, which must be
    entered and exited by the same task. LUMORA pools MCP sessions across turns,
    so each transport has a small owner task and exposes the connected Client to
    request tasks.
    """

    def __init__(self) -> None:
        self._client: SdkClient | None = None
        self._owner_task: asyncio.Task[None] | None = None
        self._ready: asyncio.Future[SdkClient] | None = None
        self._stop: asyncio.Event | None = None
        self._terminal_error: BaseException | None = None

    async def connect(self) -> SdkClient:
        if self._client is not None:
            return self._client
        if self._owner_task is not None:
            assert self._ready is not None
            return await asyncio.shield(self._ready)

        loop = asyncio.get_running_loop()
        self._terminal_error = None
        self._ready = loop.create_future()
        self._stop = asyncio.Event()
        self._owner_task = asyncio.create_task(
            self._run(),
            name="lumora-mcp-transport",
        )
        try:
            self._client = await asyncio.shield(self._ready)
            return self._client
        except BaseException:
            await self.close()
            raise

    async def close(self) -> None:
        owner = self._owner_task
        if owner is None:
            return
        assert self._stop is not None
        if self._ready is not None and not self._ready.done():
            owner.cancel()
        else:
            self._stop.set()
        try:
            await asyncio.shield(owner)
        except asyncio.CancelledError:
            if not owner.cancelled():
                raise
        finally:
            self._client = None
            self._owner_task = None
            self._ready = None
            self._stop = None

    def diagnostics(self) -> str:
        if self._terminal_error is None:
            return ""
        return str(self._terminal_error)

    async def _run(self) -> None:
        assert self._ready is not None
        assert self._stop is not None
        try:
            async with self._client_context() as client:
                if not self._ready.done():
                    self._ready.set_result(client)
                await self._stop.wait()
        except asyncio.CancelledError:
            if not self._ready.done():
                self._ready.cancel()
            raise
        except Exception as error:  # noqa: BLE001 - forward transport failures
            self._terminal_error = error
            if not self._ready.done():
                self._ready.set_exception(error)

    @abstractmethod
    def _client_context(self) -> AbstractAsyncContextManager[SdkClient]:
        raise NotImplementedError


class StreamableHttpMcpTransport(McpTransport):
    def __init__(
        self,
        config: McpServerConfig,
        *,
        http_client: httpx2.AsyncClient | None = None,
    ) -> None:
        super().__init__()
        self._config = config
        self._http_client = http_client

    @asynccontextmanager
    async def _client_context(self) -> AsyncIterator[SdkClient]:
        if not self._config.url:
            raise ValueError("Streamable HTTP MCP Server 缺少地址")

        if self._http_client is None:
            async with (
                httpx2.AsyncClient(
                    headers=self._config.authentication_headers(),
                    timeout=httpx2.Timeout(30.0, read=300.0),
                    follow_redirects=False,
                ) as http_client,
                self._sdk_client(http_client) as client,
            ):
                yield client
            return

        async with self._sdk_client(self._http_client) as client:
            yield client

    @asynccontextmanager
    async def _sdk_client(
        self,
        http_client: httpx2.AsyncClient,
    ) -> AsyncIterator[SdkClient]:
        transport = streamable_http_client(
            self._config.url,
            http_client=http_client,
        )
        async with SdkClient(
            transport,
            client_info=_CLIENT_INFO,
            mode="auto",
            read_timeout_seconds=_REQUEST_TIMEOUT_SECONDS,
        ) as client:
            yield client


class StdioMcpTransport(McpTransport):
    def __init__(self, config: McpServerConfig) -> None:
        super().__init__()
        self._config = config
        self._stderr_tail = ""

    @asynccontextmanager
    async def _client_context(self) -> AsyncIterator[SdkClient]:
        if not self._config.command:
            raise ValueError("stdio MCP Server 缺少启动命令")
        parameters = StdioServerParameters(
            command=self._config.command,
            args=list(self._config.arguments),
            env=dict(self._config.environment),
            cwd=(
                Path(self._config.working_directory)
                if self._config.working_directory
                else None
            ),
        )
        with TemporaryFile(mode="w+b") as raw_errlog:
            errlog = cast(BinaryIO, raw_errlog)
            try:
                transport = stdio_client(
                    parameters,
                    errlog=cast(TextIO, errlog),
                )
                async with SdkClient(
                    transport,
                    client_info=_CLIENT_INFO,
                    mode="auto",
                    read_timeout_seconds=_REQUEST_TIMEOUT_SECONDS,
                ) as client:
                    yield client
            finally:
                self._stderr_tail = _read_stderr_tail(
                    errlog,
                    tuple(self._config.environment.values()),
                )

    def diagnostics(self) -> str:
        parts = [value for value in (super().diagnostics(), self._stderr_tail) if value]
        return "\n".join(parts)


def create_mcp_transport(config: McpServerConfig) -> McpTransport:
    if config.transport == "stdio":
        return StdioMcpTransport(config)
    return StreamableHttpMcpTransport(config)


def _read_stderr_tail(errlog: BinaryIO, secrets: tuple[str, ...]) -> str:
    try:
        errlog.flush()
        errlog.seek(0, 2)
        end = errlog.tell()
        errlog.seek(max(0, end - _STDERR_TAIL_CHARS))
        raw_value = errlog.read(_STDERR_TAIL_CHARS)
    except OSError:
        return ""
    value = raw_value.decode("utf-8", errors="replace")
    for secret in secrets:
        if secret:
            value = value.replace(secret, "<redacted>")
    return value.strip()
