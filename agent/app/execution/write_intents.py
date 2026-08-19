import hashlib
import os
import threading
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

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


class WriterConflict(RuntimeError):
    def __init__(
        self,
        *,
        owner_id: str,
        requested: tuple[WriteScope, ...],
        conflicts: tuple[WriteIntentClaim, ...],
    ) -> None:
        self.owner_id = owner_id
        self.requested = requested
        self.conflicts = conflicts
        labels = ", ".join(
            sorted({claim.owner_label or claim.owner_id for claim in conflicts})
        )
        super().__init__(f"写入范围与正在执行的 Agent 冲突：{labels}")

    def metadata(self) -> dict[str, object]:
        return {
            "failureKind": "writer_conflict",
            "retryable": False,
            "toolExecutionState": "not_started",
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
                "等待冲突写者完成、缩小写入范围，或由 Supervisor 调整依赖后重新委派。"
            ),
        }


class WriteIntentManager:
    """Non-blocking, process-local write ownership above short resource locks."""

    def __init__(self) -> None:
        self._claims: dict[str, WriteIntentClaim] = {}
        self._guard = threading.Lock()

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
            claim = WriteIntentClaim(
                claim_id=str(uuid.uuid4()),
                owner_id=owner_id,
                owner_label=owner_label or owner_id,
                scopes=normalized,
            )
            self._claims[claim.claim_id] = claim
            return claim

    def release(self, claim: WriteIntentClaim | None) -> None:
        if claim is None:
            return
        with self._guard:
            self._claims.pop(claim.claim_id, None)

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
