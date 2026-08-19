import errno
import hashlib
import json
import random
from dataclasses import dataclass
from typing import Any

import httpx


@dataclass(frozen=True, slots=True)
class RetryPolicy:
    max_attempts: int = 3
    base_delay_seconds: float = 0.25
    max_delay_seconds: float = 2.0
    jitter_ratio: float = 0.2

    def delay_seconds(self, completed_attempts: int) -> float:
        base = min(
            self.max_delay_seconds,
            self.base_delay_seconds * (2 ** max(0, completed_attempts - 1)),
        )
        jitter = base * self.jitter_ratio
        return max(0.0, base + random.uniform(-jitter, jitter))


@dataclass(frozen=True, slots=True)
class FailureClassification:
    kind: str
    retryable: bool
    execution_state: str


_TRANSIENT_ERRNOS = frozenset({
    errno.EAGAIN,
    errno.EBUSY,
    errno.ECONNABORTED,
    errno.ECONNREFUSED,
    errno.ECONNRESET,
    errno.EHOSTUNREACH,
    errno.EINTR,
    errno.ENETDOWN,
    errno.ENETUNREACH,
    errno.ETIMEDOUT,
})
_TRANSIENT_WINERRORS = frozenset({32, 33, 64, 121, 1231, 1232})


def classify_tool_exception(
    error: BaseException,
    *,
    read_only: bool,
) -> FailureClassification:
    transient = isinstance(
        error,
        (TimeoutError, ConnectionError, httpx.TransportError),
    )
    if isinstance(error, OSError):
        transient = transient or error.errno in _TRANSIENT_ERRNOS
        transient = transient or getattr(error, "winerror", None) in (
            _TRANSIENT_WINERRORS
        )
    if transient:
        return FailureClassification(
            kind="transient_tool_error",
            retryable=read_only,
            execution_state="completed" if read_only else "unknown",
        )
    return FailureClassification(
        kind="tool_execution_error",
        retryable=False,
        execution_state="completed" if read_only else "unknown",
    )


def tool_effect_id(
    *,
    correlation_id: str,
    session_id: str,
    call_id: str,
    tool_name: str,
    arguments: dict[str, Any],
) -> str:
    canonical = json.dumps(
        arguments,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    digest = hashlib.sha256()
    for value in (
        correlation_id,
        session_id,
        call_id,
        tool_name.casefold(),
        canonical,
    ):
        digest.update(value.encode("utf-8"))
        digest.update(b"\0")
    return f"effect_{digest.hexdigest()}"
