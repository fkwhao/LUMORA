from collections.abc import Callable

import httpx

_MODEL_HTTP_TIMEOUT_SECONDS = 120.0
_MODEL_HTTP_MAX_CONNECTIONS = 100
_MODEL_HTTP_MAX_KEEPALIVE_CONNECTIONS = 20
_MODEL_HTTP_KEEPALIVE_EXPIRY_SECONDS = 120.0


def create_model_http_client(
    factory: Callable[..., httpx.AsyncClient] = httpx.AsyncClient,
) -> httpx.AsyncClient:
    """创建进程级复用的模型 HTTP 客户端，并保持现有重试语义不变。"""

    return factory(
        timeout=_MODEL_HTTP_TIMEOUT_SECONDS,
        limits=httpx.Limits(
            max_connections=_MODEL_HTTP_MAX_CONNECTIONS,
            max_keepalive_connections=_MODEL_HTTP_MAX_KEEPALIVE_CONNECTIONS,
            keepalive_expiry=_MODEL_HTTP_KEEPALIVE_EXPIRY_SECONDS,
        ),
    )
