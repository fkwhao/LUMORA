import hashlib
import json
import os
import tempfile
import threading
import time
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.tool.resource_locks import ResourceAccess


@dataclass(frozen=True, slots=True)
class WriteScope:
    path: str
    recursive: bool = False
    baseline_hash: str = ""

    def metadata(self) -> dict[str, object]:
        return {
            "path": self.path,
            "recursive": self.recursive,
            "baselineHash": self.baseline_hash,
        }


@dataclass(frozen=True, slots=True)
class WriteIntentClaim:
    claim_id: str
    owner_id: str
    owner_label: str
    scopes: tuple[WriteScope, ...]
    fencing_token: int = 0
    expires_at: float = 0.0

    def metadata(self, *, state: str = "active") -> dict[str, object]:
        return {
            "leaseId": self.claim_id,
            "ownerId": self.owner_id,
            "ownerLabel": self.owner_label,
            "writeScopes": [scope.metadata() for scope in self.scopes],
            "fencingToken": self.fencing_token,
            "leaseState": state,
            "expiresAt": (
                datetime.fromtimestamp(
                    self.expires_at, tz=timezone.utc
                ).isoformat()
                if self.expires_at > 0
                else None
            ),
        }


class WriterConflict(RuntimeError):
    def __init__(
        self,
        *,
        owner_id: str,
        requested: tuple[WriteScope, ...],
        conflicts: tuple[WriteIntentClaim, ...],
        queue_position: int = 0,
    ) -> None:
        self.owner_id = owner_id
        self.requested = requested
        self.conflicts = conflicts
        self.queue_position = queue_position
        labels = ", ".join(
            sorted({claim.owner_label or claim.owner_id for claim in conflicts})
        )
        super().__init__(f"写入范围与正在执行的 Agent 冲突：{labels}")

    def metadata(self) -> dict[str, object]:
        return {
            "failureKind": "writer_conflict",
            "retryable": True,
            "toolExecutionState": "not_started",
            "queuePosition": self.queue_position,
            "requestedWriteScopes": [scope.metadata() for scope in self.requested],
            "conflictingWriters": [
                {
                    "claimId": claim.claim_id,
                    "ownerId": claim.owner_id,
                    "ownerLabel": claim.owner_label,
                    "writeScopes": [scope.metadata() for scope in claim.scopes],
                }
                for claim in self.conflicts
            ],
            "nextAction": (
                "当前写者已进入公平等待队列；等待租约释放后重试、缩小写入范围，"
                "或由 Supervisor 调整依赖后重新委派。"
            ),
        }


class FileWriteLeaseStore:
    """Cross-process, expiring write leases with FIFO conflict ordering.

    The registry lives below the OS temporary directory rather than inside a
    user's repository.  A process-wide guard plus an OS file lock protects the
    JSON state.  Expiry makes leases recoverable after a worker crash, while a
    monotonically increasing fencing token lets durable projections reject an
    older owner that wakes up late.
    """

    def __init__(
        self,
        registry_path: Path | None = None,
        *,
        lease_ttl_seconds: float = 2 * 60 * 60,
        waiter_ttl_seconds: float = 5 * 60,
    ) -> None:
        base = Path(tempfile.gettempdir()) / "lumora-write-leases"
        self._registry_path = registry_path or (base / "registry.json")
        self._lock_path = self._registry_path.with_suffix(".lock")
        self._lease_ttl_seconds = max(30.0, lease_ttl_seconds)
        self._waiter_ttl_seconds = max(5.0, waiter_ttl_seconds)
        self._guard = threading.Lock()

    @property
    def renew_interval_seconds(self) -> float:
        return max(10.0, self._lease_ttl_seconds / 3)

    def acquire(
        self,
        owner_id: str,
        owner_label: str,
        scopes: tuple[WriteScope, ...],
    ) -> tuple[WriteIntentClaim | None, tuple[WriteIntentClaim, ...], int]:
        if not scopes:
            return None, (), 0
        now = time.time()
        fingerprint = _scope_fingerprint(scopes)
        with self._state() as state:
            _prune_state(
                state,
                now,
                waiter_ttl_seconds=self._waiter_ttl_seconds,
            )
            leases = state.setdefault("leases", [])
            waiters = state.setdefault("waiters", [])
            for raw in leases:
                if raw.get("ownerId") == owner_id and _raw_scopes_cover(
                    raw.get("scopes"), scopes
                ):
                    return _claim_from_raw(raw), (), 0

            waiter = next(
                (
                    item
                    for item in waiters
                    if item.get("ownerId") == owner_id
                    and item.get("fingerprint") == fingerprint
                ),
                None,
            )
            if waiter is None:
                ticket = int(state.get("nextTicket") or 1)
                state["nextTicket"] = ticket + 1
                waiter = {
                    "ownerId": owner_id,
                    "ownerLabel": owner_label,
                    "fingerprint": fingerprint,
                    "scopes": [scope.metadata() for scope in scopes],
                    "ticket": ticket,
                    "createdAt": now,
                    "updatedAt": now,
                }
                waiters.append(waiter)
            else:
                waiter["updatedAt"] = now

            conflicts = tuple(
                _claim_from_raw(item)
                for item in leases
                if item.get("ownerId") != owner_id
                and _scope_sets_overlap(scopes, _scopes_from_raw(item.get("scopes")))
            )
            earlier = [
                item
                for item in waiters
                if int(item.get("ticket") or 0) < int(waiter["ticket"])
                and item.get("ownerId") != owner_id
                and _scope_sets_overlap(
                    scopes, _scopes_from_raw(item.get("scopes"))
                )
            ]
            queue_position = 1 + sum(
                1
                for item in waiters
                if int(item.get("ticket") or 0) < int(waiter["ticket"])
            )
            if conflicts or earlier:
                queued_conflicts = tuple(_claim_from_waiter(item) for item in earlier)
                return None, (*conflicts, *queued_conflicts), queue_position

            fencing_token = int(state.get("nextFencingToken") or 1)
            state["nextFencingToken"] = fencing_token + 1
            claim = WriteIntentClaim(
                claim_id=f"lease_{uuid.uuid4().hex}",
                owner_id=owner_id,
                owner_label=owner_label or owner_id,
                scopes=scopes,
                fencing_token=fencing_token,
                expires_at=now + self._lease_ttl_seconds,
            )
            leases.append({
                "leaseId": claim.claim_id,
                "ownerId": claim.owner_id,
                "ownerLabel": claim.owner_label,
                "scopes": [scope.metadata() for scope in claim.scopes],
                "fencingToken": claim.fencing_token,
                "expiresAt": claim.expires_at,
                "createdAt": now,
            })
            waiters.remove(waiter)
            return claim, (), 0

    def release(self, claim: WriteIntentClaim) -> None:
        with self._state() as state:
            state["leases"] = [
                item
                for item in state.setdefault("leases", [])
                if item.get("leaseId") != claim.claim_id
            ]

    def renew(self, claim: WriteIntentClaim) -> None:
        now = time.time()
        with self._state() as state:
            _prune_state(
                state,
                now,
                waiter_ttl_seconds=self._waiter_ttl_seconds,
            )
            lease = next((
                item
                for item in state.setdefault("leases", [])
                if item.get("leaseId") == claim.claim_id
                and int(item.get("fencingToken") or 0) == claim.fencing_token
            ), None)
            if lease is None:
                raise OSError("写入租约已丢失或已被更新的 fencing token 取代")
            lease["expiresAt"] = now + self._lease_ttl_seconds

    @contextmanager
    def _state(self) -> Iterator[dict[str, Any]]:
        self._registry_path.parent.mkdir(parents=True, exist_ok=True)
        with self._guard, self._lock_path.open("a+b") as lock_stream:
            _lock_file(lock_stream)
            try:
                state = self._read()
                yield state
                self._write(state)
            finally:
                _unlock_file(lock_stream)

    def _read(self) -> dict[str, Any]:
        try:
            value = json.loads(self._registry_path.read_text(encoding="utf-8"))
            return value if isinstance(value, dict) else {}
        except FileNotFoundError:
            return {}
        except (OSError, json.JSONDecodeError) as error:
            raise OSError("跨进程写入租约注册表不可用") from error

    def _write(self, state: dict[str, Any]) -> None:
        temporary = self._registry_path.with_suffix(
            f".{uuid.uuid4().hex}.tmp"
        )
        try:
            temporary.write_text(
                json.dumps(state, ensure_ascii=False, separators=(",", ":")),
                encoding="utf-8",
            )
            os.replace(temporary, self._registry_path)
        finally:
            temporary.unlink(missing_ok=True)


class WriteIntentManager:
    """Process-local claims backed by cross-process expiring leases."""

    def __init__(
        self,
        durable_store: FileWriteLeaseStore | None = None,
    ) -> None:
        self._claims: dict[str, WriteIntentClaim] = {}
        self._guard = threading.Lock()
        self._durable_store = durable_store or FileWriteLeaseStore()

    def acquire(
        self,
        owner_id: str,
        scopes: tuple[WriteScope, ...],
        *,
        owner_label: str = "",
    ) -> WriteIntentClaim | None:
        normalized = _normalize_scopes(scopes)
        if not normalized:
            return None
        with self._guard:
            if any(
                claim.owner_id == owner_id
                and all(
                    any(_covers(held, requested) for held in claim.scopes)
                    for requested in normalized
                )
                for claim in self._claims.values()
            ):
                return None
            conflicts = tuple(
                claim
                for claim in self._claims.values()
                if claim.owner_id != owner_id
                and _scope_sets_overlap(normalized, claim.scopes)
            )
            if conflicts:
                raise WriterConflict(
                    owner_id=owner_id,
                    requested=normalized,
                    conflicts=conflicts,
                )
            claim, durable_conflicts, queue_position = self._durable_store.acquire(
                owner_id,
                owner_label or owner_id,
                normalized,
            )
            if claim is None:
                raise WriterConflict(
                    owner_id=owner_id,
                    requested=normalized,
                    conflicts=durable_conflicts,
                    queue_position=queue_position,
                )
            self._claims[claim.claim_id] = claim
            return claim

    def release(self, claim: WriteIntentClaim | None) -> None:
        if claim is None:
            return
        with self._guard:
            self._claims.pop(claim.claim_id, None)
            try:
                self._durable_store.release(claim)
            except OSError:
                # A released worker must not turn an already committed write into
                # an unknown failure.  The durable lease still expires by TTL.
                pass

    @property
    def renew_interval_seconds(self) -> float:
        return self._durable_store.renew_interval_seconds

    def renew(self, claim: WriteIntentClaim | None) -> None:
        if claim is not None:
            self._durable_store.renew(claim)

    def ensure_current(
        self,
        owner_id: str,
        scopes: tuple[WriteScope, ...],
    ) -> None:
        """Fence a write immediately before the underlying tool executes."""
        normalized = _normalize_scopes(scopes)
        if not normalized:
            return
        with self._guard:
            claim = next(
                (
                    value
                    for value in self._claims.values()
                    if value.owner_id == owner_id
                    and all(
                        any(_covers(held, requested) for held in value.scopes)
                        for requested in normalized
                    )
                ),
                None,
            )
            if claim is None:
                raise OSError("写入租约不存在，已拒绝未受保护的写入")
            # renew() checks both lease id and fencing token before extending
            # the TTL.  A stale worker therefore fails before entering the tool.
            self._durable_store.renew(claim)

    @contextmanager
    def hold(
        self,
        owner_id: str,
        scopes: tuple[WriteScope, ...],
        *,
        owner_label: str = "",
    ) -> Iterator[WriteIntentClaim | None]:
        claim = self.acquire(owner_id, scopes, owner_label=owner_label)
        try:
            yield claim
        finally:
            self.release(claim)


def scopes_from_resource_accesses(
    accesses: tuple["ResourceAccess", ...],
) -> tuple[WriteScope, ...]:
    scopes: list[WriteScope] = []
    for access in accesses:
        if str(access.mode) != "write":
            continue
        if access.key.startswith("file:"):
            path = access.key[5:]
            scopes.append(WriteScope(
                path,
                recursive=False,
                baseline_hash=_baseline_hash(Path(path)),
            ))
        elif access.key.startswith("workspace:"):
            scopes.append(WriteScope(access.key[10:], recursive=True))
        else:
            scopes.append(WriteScope(access.key, recursive=False))
    return _normalize_scopes(tuple(scopes))


def declared_write_scopes(
    workspace: Path,
    values: tuple[str, ...],
) -> tuple[WriteScope, ...]:
    root = workspace.expanduser().resolve()
    scopes: list[WriteScope] = []
    for value in values:
        raw = value.strip()
        if not raw:
            continue
        recursive = raw.endswith(("/**", "\\**"))
        path_value = raw[:-3] if recursive else raw
        if any(character in path_value for character in "*?[]"):
            raise ValueError("写入范围只支持精确路径或末尾 /** 的目录范围")
        candidate = Path(path_value)
        resolved = (
            candidate.expanduser().resolve()
            if candidate.is_absolute()
            else (root / candidate).resolve()
        )
        try:
            resolved.relative_to(root)
        except ValueError as error:
            raise ValueError("写入范围不能超出当前工作区") from error
        scopes.append(WriteScope(
            _normalize_path(resolved),
            recursive=recursive,
            baseline_hash="" if recursive else _baseline_hash(resolved),
        ))
    return _normalize_scopes(tuple(scopes))


def write_scope_sets_overlap(
    first: tuple[WriteScope, ...],
    second: tuple[WriteScope, ...],
) -> bool:
    return _scope_sets_overlap(
        _normalize_scopes(first),
        _normalize_scopes(second),
    )


def _normalize_scopes(scopes: tuple[WriteScope, ...]) -> tuple[WriteScope, ...]:
    normalized: dict[tuple[str, bool], WriteScope] = {}
    for scope in scopes:
        path = _normalize_path(Path(scope.path)) if _looks_like_path(scope.path) else scope.path
        normalized[(path, scope.recursive)] = WriteScope(
            path,
            scope.recursive,
            scope.baseline_hash,
        )
    ordered = sorted(normalized.values(), key=lambda item: (item.path, not item.recursive))
    compact: list[WriteScope] = []
    for scope in ordered:
        if any(existing.recursive and _contains(existing.path, scope.path) for existing in compact):
            continue
        compact.append(scope)
    return tuple(compact)


def _scope_sets_overlap(
    first: tuple[WriteScope, ...],
    second: tuple[WriteScope, ...],
) -> bool:
    return any(_overlaps(left, right) for left in first for right in second)


def _overlaps(first: WriteScope, second: WriteScope) -> bool:
    if first.path == second.path:
        return True
    if first.recursive and _contains(first.path, second.path):
        return True
    return second.recursive and _contains(second.path, first.path)


def _covers(held: WriteScope, requested: WriteScope) -> bool:
    return held.path == requested.path or (
        held.recursive and _contains(held.path, requested.path)
    )


def _contains(parent: str, child: str) -> bool:
    try:
        return os.path.commonpath((parent, child)) == parent
    except ValueError:
        return False


def _normalize_path(path: Path) -> str:
    return os.path.normcase(str(path.expanduser().resolve()))


def _looks_like_path(value: str) -> bool:
    return value.startswith(("/", "\\")) or (
        len(value) >= 3 and value[1] == ":" and value[2] in "\\/"
    )


def _baseline_hash(path: Path) -> str:
    try:
        if not path.is_file():
            return "absent"
        digest = hashlib.sha256()
        with path.open("rb") as stream:
            while chunk := stream.read(1024 * 1024):
                digest.update(chunk)
        return f"sha256:{digest.hexdigest()}"
    except OSError:
        return "unavailable"


def _scope_fingerprint(scopes: tuple[WriteScope, ...]) -> str:
    digest = hashlib.sha256()
    for scope in scopes:
        digest.update(scope.path.encode("utf-8"))
        digest.update(b"\1" if scope.recursive else b"\0")
    return digest.hexdigest()


def _scopes_from_raw(value: object) -> tuple[WriteScope, ...]:
    if not isinstance(value, list):
        return ()
    scopes: list[WriteScope] = []
    for item in value:
        if not isinstance(item, dict) or not item.get("path"):
            continue
        scopes.append(WriteScope(
            path=str(item["path"]),
            recursive=item.get("recursive") is True,
            baseline_hash=str(item.get("baselineHash") or ""),
        ))
    return _normalize_scopes(tuple(scopes))


def _claim_from_raw(value: dict[str, Any]) -> WriteIntentClaim:
    return WriteIntentClaim(
        claim_id=str(value.get("leaseId") or ""),
        owner_id=str(value.get("ownerId") or ""),
        owner_label=str(value.get("ownerLabel") or value.get("ownerId") or ""),
        scopes=_scopes_from_raw(value.get("scopes")),
        fencing_token=int(value.get("fencingToken") or 0),
        expires_at=float(value.get("expiresAt") or 0),
    )


def _claim_from_waiter(value: dict[str, Any]) -> WriteIntentClaim:
    return WriteIntentClaim(
        claim_id=f"waiter_{int(value.get('ticket') or 0)}",
        owner_id=str(value.get("ownerId") or ""),
        owner_label=str(value.get("ownerLabel") or value.get("ownerId") or ""),
        scopes=_scopes_from_raw(value.get("scopes")),
    )


def _raw_scopes_cover(
    raw: object,
    requested: tuple[WriteScope, ...],
) -> bool:
    held = _scopes_from_raw(raw)
    return all(any(_covers(scope, item) for scope in held) for item in requested)


def _prune_state(
    state: dict[str, Any],
    now: float,
    *,
    waiter_ttl_seconds: float,
) -> None:
    leases = state.get("leases")
    state["leases"] = [
        item
        for item in (leases if isinstance(leases, list) else [])
        if isinstance(item, dict) and float(item.get("expiresAt") or 0) > now
    ]
    waiters = state.get("waiters")
    state["waiters"] = [
        item
        for item in (waiters if isinstance(waiters, list) else [])
        if isinstance(item, dict)
        and now - float(item.get("updatedAt") or item.get("createdAt") or 0)
        <= waiter_ttl_seconds
    ]


def _lock_file(stream) -> None:
    stream.seek(0)
    if os.name == "nt":
        import msvcrt

        stream.write(b"\0")
        stream.flush()
        stream.seek(0)
        msvcrt.locking(stream.fileno(), msvcrt.LK_LOCK, 1)
        return
    import fcntl

    fcntl.flock(stream.fileno(), fcntl.LOCK_EX)  # type: ignore[attr-defined]


def _unlock_file(stream) -> None:
    stream.seek(0)
    if os.name == "nt":
        import msvcrt

        msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
        return
    import fcntl

    fcntl.flock(stream.fileno(), fcntl.LOCK_UN)  # type: ignore[attr-defined]
