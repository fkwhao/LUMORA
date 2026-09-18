from __future__ import annotations

import asyncio
import base64
import ctypes
import ctypes.wintypes
import json
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal
from urllib.parse import quote
from uuid import uuid4

import httpx2
from mcp.client.auth import AuthorizationCodeResult, OAuthClientProvider
from mcp.shared.auth import (
    OAuthClientInformationFull,
    OAuthClientMetadata,
    OAuthToken,
)
from pydantic import AnyUrl

from app.dto.response.mcp_response import McpOAuthResponse, McpTestResponse
from app.mcp.model import McpServerConfig, McpTestResult

_DEFAULT_HOST = "127.0.0.1"
_DEFAULT_PORT = 45101
_FLOW_START_TIMEOUT_SECONDS = 30.0
_FLOW_RETENTION_SECONDS = 15 * 60

_runtime_host = _DEFAULT_HOST
_runtime_port = _DEFAULT_PORT
_runtime_storage_root = Path.home() / ".lumora" / "mcp-oauth"
_storage_locks: dict[Path, asyncio.Lock] = {}


def configure_oauth_runtime(
    host: str = _DEFAULT_HOST,
    port: int = _DEFAULT_PORT,
    storage_root: Path | None = None,
) -> None:
    global _runtime_host, _runtime_port, _runtime_storage_root
    _runtime_host = host
    _runtime_port = port
    if storage_root is not None:
        _runtime_storage_root = storage_root


def oauth_redirect_uri(server_id: str) -> str:
    return (
        f"http://{_runtime_host}:{_runtime_port}"
        f"/api/v1/mcp/oauth/callback/{quote(server_id, safe='')}"
    )


def oauth_token_storage(server_id: str) -> FileTokenStorage:
    return FileTokenStorage(_runtime_storage_root / f"{server_id}.json")


def create_oauth_provider(
    config: McpServerConfig,
    *,
    redirect_handler=None,
    callback_handler=None,
) -> OAuthClientProvider:
    return OAuthClientProvider(
        server_url=config.url,
        client_metadata=OAuthClientMetadata(
            client_name="LUMORA",
            redirect_uris=[AnyUrl(oauth_redirect_uri(config.server_id))],
            token_endpoint_auth_method="none",
            application_type="native",
        ),
        storage=oauth_token_storage(config.server_id),
        redirect_handler=redirect_handler,
        callback_handler=callback_handler,
    )


class FileTokenStorage:
    """Small per-server TokenStorage implementation for the MCP SDK.

    The file lives in the current user's LUMORA data directory and is written
    atomically. Access tokens never cross the Core/desktop response boundary.
    """

    def __init__(self, path: Path) -> None:
        self._path = path
        self._lock = _storage_locks.setdefault(path, asyncio.Lock())

    async def get_tokens(self) -> OAuthToken | None:
        payload = await self._read()
        value = payload.get("tokens")
        if not isinstance(value, dict):
            return None
        try:
            return OAuthToken.model_validate(value)
        except ValueError:
            return None

    async def set_tokens(self, tokens: OAuthToken) -> None:
        await self._update("tokens", tokens.model_dump(mode="json", exclude_none=True))

    async def get_client_info(self) -> OAuthClientInformationFull | None:
        payload = await self._read()
        value = payload.get("clientInfo")
        if not isinstance(value, dict):
            return None
        try:
            return OAuthClientInformationFull.model_validate(value)
        except ValueError:
            return None

    async def set_client_info(self, client_info: OAuthClientInformationFull) -> None:
        await self._update(
            "clientInfo",
            client_info.model_dump(mode="json", exclude_none=True),
        )

    async def _read(self) -> dict[str, object]:
        async with self._lock:
            return await asyncio.to_thread(self._read_sync)

    async def _update(self, key: str, value: object) -> None:
        async with self._lock:
            payload = await asyncio.to_thread(self._read_sync)
            payload[key] = value
            await asyncio.to_thread(self._write_sync, payload)

    def _read_sync(self) -> dict[str, object]:
        try:
            payload = json.loads(self._path.read_text(encoding="utf-8"))
        except (FileNotFoundError, OSError, ValueError):
            return {}
        if not isinstance(payload, dict):
            return {}
        protected = payload.get("protected")
        if isinstance(protected, str):
            try:
                plaintext = _dpapi_unprotect(base64.b64decode(protected))
                decoded = json.loads(plaintext.decode("utf-8"))
                return decoded if isinstance(decoded, dict) else {}
            except (ValueError, OSError, UnicodeDecodeError):
                return {}
        # Accept the original development format so an upgrade does not lose
        # an already-authorized local server; the next write encrypts it.
        return payload

    def _write_sync(self, payload: dict[str, object]) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self._path.with_suffix(".tmp")
        serialized = json.dumps(
            payload,
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode("utf-8")
        if os.name == "nt":
            file_payload = {
                "version": 1,
                "protected": base64.b64encode(_dpapi_protect(serialized)).decode(
                    "ascii"
                ),
            }
        else:
            file_payload = payload
        temporary.write_text(
            json.dumps(file_payload, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        temporary.replace(self._path)
        if os.name != "nt":
            try:
                self._path.chmod(0o600)
            except OSError:
                pass


class _DataBlob(ctypes.Structure):
    _fields_ = [
        ("cbData", ctypes.wintypes.DWORD),
        ("pbData", ctypes.POINTER(ctypes.c_byte)),
    ]


def _dpapi_protect(value: bytes) -> bytes:
    if os.name != "nt":
        return value
    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32
    source_buffer = ctypes.create_string_buffer(value)
    source = _DataBlob(
        len(value),
        ctypes.cast(source_buffer, ctypes.POINTER(ctypes.c_byte)),
    )
    result = _DataBlob()
    if not crypt32.CryptProtectData(
        ctypes.byref(source),
        None,
        None,
        None,
        None,
        0,
        ctypes.byref(result),
    ):
        raise OSError(ctypes.get_last_error(), "Windows DPAPI 加密失败")
    try:
        return ctypes.string_at(result.pbData, result.cbData)
    finally:
        kernel32.LocalFree(result.pbData)


def _dpapi_unprotect(value: bytes) -> bytes:
    if os.name != "nt":
        return value
    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32
    source_buffer = ctypes.create_string_buffer(value)
    source = _DataBlob(
        len(value),
        ctypes.cast(source_buffer, ctypes.POINTER(ctypes.c_byte)),
    )
    result = _DataBlob()
    if not crypt32.CryptUnprotectData(
        ctypes.byref(source),
        None,
        None,
        None,
        None,
        0,
        ctypes.byref(result),
    ):
        raise OSError(ctypes.get_last_error(), "Windows DPAPI 解密失败")
    try:
        return ctypes.string_at(result.pbData, result.cbData)
    finally:
        kernel32.LocalFree(result.pbData)


@dataclass(slots=True)
class _OAuthFlow:
    flow_id: str
    server_id: str
    status: Literal["pending", "awaiting_authorization", "completed", "failed"] = "pending"
    authorization_url: str | None = None
    result: McpTestResult | None = None
    error: str | None = None
    created_at: float = field(default_factory=time.monotonic)
    ready: asyncio.Event = field(default_factory=asyncio.Event)
    done: asyncio.Event = field(default_factory=asyncio.Event)
    callback: asyncio.Future[AuthorizationCodeResult] | None = None
    task: asyncio.Task[None] | None = None


class McpOAuthManager:
    def __init__(self) -> None:
        self._flows: dict[str, _OAuthFlow] = {}
        self._active_by_server: dict[str, str] = {}
        self._lock = asyncio.Lock()

    async def start(self, config: McpServerConfig) -> McpOAuthResponse:
        if config.auth_type != "oauth":
            raise ValueError("MCP Server 未配置 OAuth")
        await self._purge()
        async with self._lock:
            active_id = self._active_by_server.get(config.server_id)
            flow = self._flows.get(active_id) if active_id else None
            if flow is None or flow.done.is_set():
                loop = asyncio.get_running_loop()
                flow = _OAuthFlow(
                    flow_id=uuid4().hex,
                    server_id=config.server_id,
                    callback=loop.create_future(),
                )
                self._flows[flow.flow_id] = flow
                self._active_by_server[config.server_id] = flow.flow_id
                flow.task = asyncio.create_task(
                    self._run(flow, config),
                    name=f"lumora-mcp-oauth-{config.server_id}",
                )
        try:
            await asyncio.wait_for(
                self._wait_for_start(flow),
                timeout=_FLOW_START_TIMEOUT_SECONDS,
            )
        except TimeoutError:
            flow.status = "failed"
            flow.error = "等待 MCP OAuth 授权地址超时"
            if flow.task is not None:
                flow.task.cancel()
                await asyncio.gather(flow.task, return_exceptions=True)
        return self._snapshot(flow)

    async def status(self, flow_id: str) -> McpOAuthResponse:
        await self._purge()
        flow = self._flows.get(flow_id)
        if flow is None:
            raise ValueError("MCP OAuth flow 不存在或已过期")
        return self._snapshot(flow)

    async def callback(
        self,
        server_id: str,
        code: str,
        state: str | None,
        issuer: str | None,
        error: str | None,
    ) -> str:
        flow_id = self._active_by_server.get(server_id)
        flow = self._flows.get(flow_id) if flow_id else None
        if flow is None or flow.callback is None or flow.done.is_set():
            raise ValueError("MCP OAuth callback 不存在或已处理")
        if error:
            code = ""
        if not flow.callback.done():
            flow.callback.set_result(
                AuthorizationCodeResult(code=code, state=state, iss=issuer)
            )
        return (
            "<!doctype html><meta charset='utf-8'><title>LUMORA OAuth</title>"
            "<p>授权回调已收到，可以返回 LUMORA。</p>"
            "<script>setTimeout(() => window.close(), 250);</script>"
        )

    async def _wait_for_start(self, flow: _OAuthFlow) -> None:
        while not flow.ready.is_set() and not flow.done.is_set():
            await asyncio.sleep(0.05)

    async def _run(self, flow: _OAuthFlow, config: McpServerConfig) -> None:
        from app.mcp.client import McpClient
        from app.mcp.transport import StreamableHttpMcpTransport

        async def redirect_handler(url: str) -> None:
            flow.authorization_url = url
            flow.status = "awaiting_authorization"
            flow.ready.set()

        async def callback_handler() -> AuthorizationCodeResult:
            assert flow.callback is not None
            return await flow.callback

        try:
            provider = create_oauth_provider(
                config,
                redirect_handler=redirect_handler,
                callback_handler=callback_handler,
            )
            async with httpx2.AsyncClient(
                auth=provider,
                timeout=httpx2.Timeout(30.0, read=300.0),
                follow_redirects=False,
            ) as http_client:
                client = McpClient(
                    config,
                    transport=StreamableHttpMcpTransport(
                        config,
                        http_client=http_client,
                    ),
                    connect_timeout_seconds=600.0,
                )
                try:
                    flow.result = await client.test()
                    flow.status = "completed"
                    flow.ready.set()
                finally:
                    await client.close()
        except asyncio.CancelledError:
            raise
        except Exception as error:  # noqa: BLE001 - surfaced as flow status
            flow.status = "failed"
            flow.error = str(error).strip() or type(error).__name__
            flow.ready.set()
        finally:
            flow.done.set()
            async with self._lock:
                if self._active_by_server.get(flow.server_id) == flow.flow_id:
                    self._active_by_server.pop(flow.server_id, None)

    async def _purge(self) -> None:
        cutoff = time.monotonic() - _FLOW_RETENTION_SECONDS
        async with self._lock:
            expired = [
                flow_id
                for flow_id, flow in self._flows.items()
                if flow.done.is_set() and flow.created_at < cutoff
            ]
            for flow_id in expired:
                self._flows.pop(flow_id, None)

    @staticmethod
    def _snapshot(flow: _OAuthFlow) -> McpOAuthResponse:
        result = None
        if flow.result is not None:
            result = McpTestResponse(
                connected=True,
                serverName=flow.result.server_name,
                serverVersion=flow.result.server_version,
                tools=list(flow.result.tools),
                resources=list(flow.result.resources),
                resourceTemplates=list(flow.result.resource_templates),
                prompts=list(flow.result.prompts),
                echoOutput=flow.result.echo_output,
            )
        return McpOAuthResponse(
            flowId=flow.flow_id,
            status=flow.status,
            authorizationUrl=flow.authorization_url,
            result=result,
            error=flow.error,
        )
