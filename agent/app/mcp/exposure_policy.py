import re
from urllib.parse import urlparse

from app.dto.request.chat_completion_request import McpServerRequest

_GENERIC_SERVER_TERMS = {
    "api",
    "com",
    "dev",
    "example",
    "for",
    "http",
    "https",
    "local",
    "localhost",
    "mcp",
    "net",
    "org",
    "remote",
    "server",
    "service",
    "test",
    "tool",
    "tools",
    "www",
}

_MCP_USE_PATTERNS = (
    re.compile(
        r"(?:调用|使用|连接|通过|执行|读取|列出|获取|查询).{0,24}MCP",
        re.IGNORECASE,
    ),
    re.compile(
        r"MCP.{0,24}(?:调用|使用|连接|执行|读取|列出|获取|查询)",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:call|use|connect|invoke|read|list|fetch|query)\b.{0,24}\bmcp\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\bmcp\b.{0,24}\b(?:call|use|connect|invoke|read|list|fetch|query)\b",
        re.IGNORECASE,
    ),
)

_CAPABILITY_REQUEST_PATTERNS = (
    re.compile(
        r"\bmcp\b.{0,24}\b(?:resource|resources|prompt|prompts)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:resource|resources|prompt|prompts)\b.{0,24}\bmcp\b",
        re.IGNORECASE,
    ),
    re.compile(r"MCP.{0,24}(?:资源|提示词|提示模板)"),
    re.compile(
        r"(?:资源|提示词|提示模板).{0,24}MCP",
        re.IGNORECASE,
    ),
)


def should_expose_capability_tools(user_request: str) -> bool:
    """Expose Resources/Prompts bridges only for an explicit MCP feature intent.

    Resources and Prompts are MCP client capabilities, not ordinary model tools.
    LUMORA bridges them into tools only when the user explicitly asks for those
    MCP features, so connecting a server does not trigger speculative catalog
    exploration on every agent turn.
    """
    request = user_request.strip()
    return bool(request) and any(
        pattern.search(request) for pattern in _CAPABILITY_REQUEST_PATTERNS
    )


def should_connect_server(
    user_request: str,
    server: McpServerRequest,
) -> bool:
    """Select an enabled MCP server from the current request, before I/O.

    Connecting may perform network I/O or start a local process, so an enabled
    server is not activated merely to discover whether it could be useful. Explicit MCP
    intent activates configured servers; otherwise a server is activated only
    when its meaningful name or endpoint identity occurs in the request.
    """
    request = user_request.casefold()
    if not request.strip():
        return False
    if should_expose_capability_tools(request) or any(
        pattern.search(request) for pattern in _MCP_USE_PATTERNS
    ):
        return True
    return any(signal in request for signal in _server_signals(server))


def _server_signals(server: McpServerRequest) -> tuple[str, ...]:
    parsed = urlparse((server.url or "").strip())
    candidates = [
        server.name,
        server.server_id,
        parsed.hostname or "",
        server.command or "",
    ]
    signals: list[str] = []
    for candidate in candidates:
        for token in re.findall(r"[\w\u4e00-\u9fff]+", candidate.casefold()):
            if len(token) < 3 or token in _GENERIC_SERVER_TERMS:
                continue
            signals.append(token)
    return tuple(dict.fromkeys(signals))
