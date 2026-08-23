from __future__ import annotations

import base64
import difflib
import hashlib
import os
import subprocess
import tempfile
import threading
from collections import defaultdict, deque
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.tool.resource_locks import ResourceAccess

MAX_PATCH_CHARS = 200_000
MAX_TOTAL_PATCH_CHARS = 500_000
MAX_CHANGE_FILES = 500
MAX_RETAINED_EVENTS = 2_000
MAX_INVENTORY_FILES = 5_000
MAX_PATCHABLE_FILE_BYTES = 180_000
MAX_TOTAL_CONTENT_CHARS = 500_000
_IGNORED_DIRECTORIES = {
    ".git",
    ".venv",
    "node_modules",
    "build",
    "dist",
    "target",
    "__pycache__",
}


@dataclass(frozen=True, slots=True)
class _FileState:
    exists: bool
    digest: str
    content: bytes | None
    blob: str


@dataclass(frozen=True, slots=True)
class WorkspaceMutationSnapshot:
    workspace_path: Path
    repository_root: Path | None
    tree: str
    files: dict[str, _FileState]
    complete: bool
    private_paths: frozenset[str]


@dataclass(frozen=True, slots=True)
class WorkspaceChangeEvent:
    task_id: str
    run_id: str
    agent_id: str
    workspace_path: str
    repository_root: str
    path: str
    operation: str
    previous_path: str
    before_hash: str
    after_hash: str
    before_blob: str
    after_blob: str
    before_content: str
    after_content: str
    patch: str
    truncated: bool
    binary: bool
    additions: int
    deletions: int
    revision: int

    def metadata(self) -> dict[str, Any]:
        return {
            "taskId": self.task_id,
            "runId": self.run_id,
            "agentId": self.agent_id,
            "workspacePath": self.workspace_path,
            "repositoryRoot": self.repository_root,
            "path": self.path,
            "operation": self.operation,
            "previousPath": self.previous_path,
            "beforeHash": self.before_hash,
            "afterHash": self.after_hash,
            "beforeBlob": self.before_blob,
            "afterBlob": self.after_blob,
            "beforeContent": self.before_content,
            "afterContent": self.after_content,
            "patch": self.patch,
            "truncated": self.truncated,
            "binary": self.binary,
            "additions": self.additions,
            "deletions": self.deletions,
            "revision": self.revision,
        }

    def notice_metadata(self) -> dict[str, Any]:
        return {
            "taskId": self.task_id,
            "runId": self.run_id,
            "agentId": self.agent_id,
            "path": self.path,
            "operation": self.operation,
            "previousPath": self.previous_path,
            "beforeHash": self.before_hash,
            "afterHash": self.after_hash,
            "revision": self.revision,
        }


class WorkspaceChangeLedger:
    """Process-wide workspace revision stream shared by every top-level Run.

    Resource locks provide the publication boundary.  This ledger is deliberately
    independent from Git branches: Local Runs that share one physical directory
    see a monotonically increasing revision and can attribute each successful
    write to the task and Run that held the write lock.
    """

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._revisions: dict[str, int] = defaultdict(int)
        self._events: dict[str, deque[WorkspaceChangeEvent]] = defaultdict(
            lambda: deque(maxlen=MAX_RETAINED_EVENTS)
        )
        self._run_cursors: dict[tuple[str, str], int] = {}

    def begin_run(self, workspace_path: Path, run_id: str) -> int:
        key = _workspace_key(workspace_path)
        with self._lock:
            revision = self._revisions[key]
            self._run_cursors.setdefault((key, run_id), revision)
            return revision

    def revision(self, workspace_path: Path) -> int:
        with self._lock:
            return self._revisions[_workspace_key(workspace_path)]

    def has_foreign_change_after(
        self,
        workspace_path: Path,
        run_id: str,
        revision: int,
    ) -> tuple[bool, int]:
        """Check staleness after a caller has acquired the workspace lock."""
        key = _workspace_key(workspace_path)
        with self._lock:
            current = self._revisions[key]
            if revision < 0 or current <= revision:
                return False, current
            events = tuple(self._events[key])
            if events and revision < events[0].revision - 1:
                return True, current
            return any(
                event.revision > revision and event.run_id != run_id
                for event in events
            ), current

    def record(
        self,
        *,
        workspace_path: Path,
        repository_root: Path | None,
        task_id: str,
        run_id: str,
        agent_id: str,
        changes: Iterable[dict[str, Any]],
    ) -> tuple[int, tuple[WorkspaceChangeEvent, ...]]:
        normalized = tuple(
            change
            for change in changes
            if (
                change.get("beforeHash") != change.get("afterHash")
                or change.get("operation") in {"RENAMED", "COPIED"}
                or bool(change.get("previousPath"))
            )
        )
        key = _workspace_key(workspace_path)
        with self._lock:
            if not normalized:
                return self._revisions[key], ()
            revision = self._revisions[key] + 1
            self._revisions[key] = revision
            recorded_values: list[WorkspaceChangeEvent] = []
            patch_budget = MAX_TOTAL_PATCH_CHARS
            content_budget = MAX_TOTAL_CONTENT_CHARS
            for change in normalized[:MAX_CHANGE_FILES]:
                raw_patch = str(change.get("patch") or "")
                retained_patch = raw_patch[: min(MAX_PATCH_CHARS, patch_budget)]
                truncated = (
                    bool(change.get("truncated"))
                    or len(retained_patch) < len(raw_patch)
                )
                patch_budget -= len(retained_patch)
                before_content = str(change.get("beforeContent") or "")
                after_content = str(change.get("afterContent") or "")
                retained_content = len(before_content) + len(after_content)
                content_truncated = retained_content > content_budget
                if content_truncated:
                    before_content = ""
                    after_content = ""
                else:
                    content_budget -= retained_content
                recorded_values.append(WorkspaceChangeEvent(
                    task_id=task_id,
                    run_id=run_id,
                    agent_id=agent_id,
                    workspace_path=str(workspace_path.resolve()),
                    repository_root=(
                        str(repository_root.resolve()) if repository_root else ""
                    ),
                    path=str(change.get("path") or ""),
                    operation=str(change.get("operation") or "MODIFIED"),
                    previous_path=str(change.get("previousPath") or ""),
                    before_hash=str(change.get("beforeHash") or ""),
                    after_hash=str(change.get("afterHash") or ""),
                    before_blob=str(change.get("beforeBlob") or ""),
                    after_blob=str(change.get("afterBlob") or ""),
                    before_content=before_content,
                    after_content=after_content,
                    patch=retained_patch,
                    truncated=truncated or content_truncated,
                    binary=bool(change.get("binary", False)),
                    additions=int(change.get("additions") or 0),
                    deletions=int(change.get("deletions") or 0),
                    revision=revision,
                ))
            recorded = tuple(
                event for event in recorded_values if event.path.strip()
            )
            self._events[key].extend(recorded)
            return revision, recorded

    def consume_external(
        self,
        workspace_path: Path,
        run_id: str,
    ) -> tuple[int, tuple[WorkspaceChangeEvent, ...]]:
        key = _workspace_key(workspace_path)
        cursor_key = (key, run_id)
        with self._lock:
            current = self._revisions[key]
            previous = self._run_cursors.get(cursor_key, current)
            self._run_cursors[cursor_key] = current
            if current <= previous:
                return current, ()
            return current, tuple(
                event
                for event in self._events[key]
                if event.revision > previous and event.run_id != run_id
            )

    def capture(
        self,
        workspace_path: Path,
        accesses: Iterable[ResourceAccess],
        private_paths: Iterable[str] = (),
    ) -> WorkspaceMutationSnapshot:
        workspace = workspace_path.resolve()
        file_paths = tuple(
            Path(access.key.removeprefix("file:"))
            for access in accesses
            if _is_write(access)
            and access.key.startswith("file:")
        )
        workspace_write = any(
            _is_write(access)
            and access.key.startswith("workspace:")
            for access in accesses
        )
        repository_root = _repository_root(workspace)
        if workspace_write and repository_root is not None:
            ignored_files, complete, ignored_paths = _git_ignored_inventory(
                repository_root,
                private_paths,
            )
            tree = _git_workspace_tree(repository_root, ignored_paths)
            return WorkspaceMutationSnapshot(
                workspace,
                repository_root,
                tree,
                ignored_files,
                complete,
                ignored_paths,
            )
        if workspace_write:
            files, complete = _inventory(workspace)
            return WorkspaceMutationSnapshot(
                workspace,
                None,
                "",
                files,
                complete,
                frozenset(),
            )
        exact_files: dict[str, _FileState] = {}
        exact_private_paths: set[str] = set()
        for path in file_paths:
            display_path = _display_path(repository_root or workspace, path)
            private = repository_root is not None and _git_is_ignored(
                repository_root, display_path
            )
            exact_files[display_path] = _file_state(
                path,
                None if private else repository_root,
                retain_content=not private,
            )
            if private:
                exact_private_paths.add(display_path)
        return WorkspaceMutationSnapshot(
            workspace,
            repository_root,
            "",
            exact_files,
            True,
            frozenset(exact_private_paths),
        )

    def compare(
        self,
        before: WorkspaceMutationSnapshot,
        after: WorkspaceMutationSnapshot,
    ) -> tuple[dict[str, Any], ...]:
        if (
            before.repository_root is not None
            and after.repository_root == before.repository_root
            and before.tree
            and after.tree
        ):
            tree_changes = _git_tree_changes(
                before.repository_root,
                before.tree,
                after.tree,
            )
            merged_tree_changes: list[dict[str, Any]] = []
            tree_paths: set[str] = set()
            for change in tree_changes:
                path = str(change.get("path") or "")
                previous_path = str(change.get("previousPath") or "")
                tree_paths.update((path, previous_path))
                if path not in before.files and path not in after.files:
                    merged_tree_changes.append(change)
                    continue
                before_path = previous_path or path
                old = before.files.get(before_path) or _git_tree_file_state(
                    before.repository_root,
                    before.tree,
                    before_path,
                )
                new = after.files.get(path) or _git_tree_file_state(
                    before.repository_root,
                    after.tree,
                    path,
                )
                transition = _change_from_states(
                    path,
                    old,
                    new,
                    previous_path=previous_path,
                    private=(
                        path in before.private_paths
                        or path in after.private_paths
                        or before_path in before.private_paths
                    ),
                )
                if transition is not None:
                    merged_tree_changes.append(transition)
            physical_changes = _file_changes(before, after, tree_paths)
            return (*merged_tree_changes, *physical_changes)
        return _file_changes(before, after, set())


def _file_changes(
    before: WorkspaceMutationSnapshot,
    after: WorkspaceMutationSnapshot,
    excluded_paths: set[str],
) -> tuple[dict[str, Any], ...]:
    paths = sorted(
        (set(before.files) | set(after.files)) - excluded_paths
    )
    changes: list[dict[str, Any]] = []
    for path in paths:
        old = before.files.get(path, _FileState(False, "", None, ""))
        new = after.files.get(path, _FileState(False, "", None, ""))
        change = _change_from_states(
            path,
            old,
            new,
            before=before,
            after=after,
            private=(
                path in before.private_paths or path in after.private_paths
            ),
        )
        if change is not None:
            changes.append(change)
    return tuple(changes)


def _change_from_states(
    path: str,
    old: _FileState,
    new: _FileState,
    *,
    previous_path: str = "",
    before: WorkspaceMutationSnapshot | None = None,
    after: WorkspaceMutationSnapshot | None = None,
    private: bool = False,
) -> dict[str, Any] | None:
    if old.digest == new.digest and old.exists == new.exists:
        return None
    patch, binary, truncated, additions, deletions = _content_patch(
        path, old, new
    )
    return {
        "path": path,
        "operation": (
            "RENAMED" if previous_path else
            "ADDED" if not old.exists else
            "DELETED" if not new.exists else "MODIFIED"
        ),
        "previousPath": previous_path,
        "beforeHash": old.digest,
        "afterHash": new.digest,
        "beforeBlob": old.blob,
        "afterBlob": new.blob,
        "beforeContent": (
            _encoded_content(old, before) if before is not None else ""
        ),
        "afterContent": (
            _encoded_content(new, after) if after is not None else ""
        ),
        "patch": patch,
        "binary": binary,
        "truncated": truncated,
        "additions": additions,
        "deletions": deletions,
        "attributionComplete": not private,
    }


def _encoded_content(
    state: _FileState,
    snapshot: WorkspaceMutationSnapshot,
) -> str:
    if snapshot.repository_root is not None or not state.exists:
        return ""
    if state.content is None:
        return ""
    return base64.b64encode(state.content).decode("ascii")


def _workspace_key(path: Path) -> str:
    resolved = path.expanduser().resolve()
    current = resolved if resolved.is_dir() else resolved.parent
    for candidate in (current, *current.parents):
        if (candidate / ".git").exists():
            return os.path.normcase(str(candidate))
    return os.path.normcase(str(current))


def _is_write(access: ResourceAccess) -> bool:
    return str(getattr(access.mode, "value", access.mode)).lower() == "write"


def _repository_root(workspace: Path) -> Path | None:
    result = _git(workspace, "rev-parse", "--show-toplevel")
    if result.returncode != 0:
        return None
    value = result.stdout.decode("utf-8", errors="replace").strip()
    return Path(value).resolve() if value else None


def _git_workspace_tree(
    repository_root: Path,
    private_paths: Iterable[str] = (),
) -> str:
    index_tree = _require_git(repository_root, "write-tree").strip()
    with tempfile.NamedTemporaryFile(
        prefix="lumora-agent-index-", delete=False
    ) as temporary:
        temporary_path = Path(temporary.name)
    temporary_path.unlink(missing_ok=True)
    environment = {
        **os.environ,
        "GIT_INDEX_FILE": str(temporary_path),
        "GIT_WORK_TREE": str(repository_root),
    }
    try:
        _require_git(repository_root, "read-tree", index_tree, env=environment)
        private = frozenset(path for path in private_paths if path)
        changed_paths = tuple(
            path for path in _git_workspace_change_paths(repository_root)
            if path not in private
        )
        if changed_paths:
            with tempfile.NamedTemporaryFile(
                prefix="lumora-agent-pathspec-", delete=False
            ) as pathspec_file:
                pathspec_path = Path(pathspec_file.name)
                pathspec_file.write(
                    b"\0".join(
                        path.encode("utf-8", errors="surrogateescape")
                        for path in changed_paths
                    ) + b"\0"
                )
            try:
                _require_git(
                    repository_root,
                    "add",
                    "-A",
                    f"--pathspec-from-file={pathspec_path.as_posix()}",
                    "--pathspec-file-nul",
                    env=environment,
                )
            finally:
                pathspec_path.unlink(missing_ok=True)
        return _require_git(repository_root, "write-tree", env=environment).strip()
    finally:
        temporary_path.unlink(missing_ok=True)


def _git_workspace_change_paths(repository_root: Path) -> tuple[str, ...]:
    outputs = (
        _require_git(repository_root, "diff", "--name-only", "-z", "--"),
        _require_git(
            repository_root,
            "ls-files",
            "--others",
            "--exclude-standard",
            "-z",
            "--",
        ),
    )
    return tuple(dict.fromkeys(
        path
        for output in outputs
        for path in output.split("\0")
        if path
    ))


def _git_tree_changes(
    repository_root: Path,
    before_tree: str,
    after_tree: str,
) -> tuple[dict[str, Any], ...]:
    if before_tree == after_tree:
        return ()
    output = _require_git(
        repository_root,
        "diff",
        "--name-status",
        "-z",
        "-M",
        "-C",
        before_tree,
        after_tree,
        "--",
    )
    fields = tuple(value for value in output.split("\0") if value)
    changed_paths: list[tuple[str, str, str]] = []
    index = 0
    while index < len(fields):
        raw_status = fields[index]
        index += 1
        if index >= len(fields):
            break
        first_path = fields[index]
        index += 1
        if raw_status.startswith(("R", "C")) and index < len(fields):
            changed_paths.append((raw_status, fields[index], first_path))
            index += 1
        else:
            changed_paths.append((raw_status, first_path, ""))
    result: list[dict[str, Any]] = []
    for raw_status, path, previous_path in changed_paths:
        before_path = previous_path or path
        before_blob = (
            "" if raw_status.startswith("C")
            else _git_blob(repository_root, before_tree, before_path)
        )
        after_blob = _git_blob(repository_root, after_tree, path)
        pathspecs = (before_path, path) if previous_path else (path,)
        patch = _require_git(
            repository_root,
            "diff",
            "--no-ext-diff",
            "--no-color",
            "--unified=3",
            "-M",
            "-C",
            before_tree,
            after_tree,
            "--",
            *pathspecs,
        )
        additions, deletions, binary = _git_numstat(
            repository_root,
            before_tree,
            after_tree,
            pathspecs,
        )
        result.append(
            {
                "path": path,
                "operation": _git_operation(raw_status),
                "previousPath": previous_path,
                "beforeHash": before_blob,
                "afterHash": after_blob,
                "beforeBlob": before_blob,
                "afterBlob": after_blob,
                "patch": patch[:MAX_PATCH_CHARS],
                "truncated": len(patch) > MAX_PATCH_CHARS,
                "binary": binary,
                "additions": additions,
                "deletions": deletions,
            }
        )
    return tuple(result)


def _git_operation(raw_status: str) -> str:
    return {
        "A": "ADDED",
        "D": "DELETED",
        "R": "RENAMED",
        "C": "COPIED",
    }.get(raw_status[:1], "MODIFIED")


def _git_numstat(
    repository_root: Path,
    before_tree: str,
    after_tree: str,
    pathspecs: tuple[str, ...],
) -> tuple[int, int, bool]:
    output = _require_git(
        repository_root,
        "diff",
        "--numstat",
        "-z",
        "-M",
        "-C",
        before_tree,
        after_tree,
        "--",
        *pathspecs,
    )
    additions = 0
    deletions = 0
    binary = False
    for record in output.split("\0"):
        if not record:
            continue
        fields = record.split("\t", 2)
        if len(fields) < 2:
            continue
        if fields[0] == "-" or fields[1] == "-":
            binary = True
            continue
        try:
            additions += int(fields[0])
            deletions += int(fields[1])
        except ValueError:
            continue
    return additions, deletions, binary


def _git_blob(repository_root: Path, tree: str, path: str) -> str:
    result = _git(repository_root, "rev-parse", f"{tree}:{path}")
    return (
        result.stdout.decode("utf-8", errors="replace").strip()
        if result.returncode == 0
        else ""
    )


def _inventory(workspace: Path) -> tuple[dict[str, _FileState], bool]:
    result: dict[str, _FileState] = {}
    for root, directories, files in os.walk(workspace):
        directories[:] = [
            name for name in directories if name not in _IGNORED_DIRECTORIES
        ]
        for name in files:
            path = Path(root) / name
            result[_display_path(workspace, path)] = _file_state(path, None)
            if len(result) >= MAX_INVENTORY_FILES:
                return result, False
    return result, True


def _git_ignored_inventory(
    repository_root: Path,
    retained_private_paths: Iterable[str] = (),
) -> tuple[dict[str, _FileState], bool, frozenset[str]]:
    result = _git(
        repository_root,
        "ls-files",
        "--others",
        "--ignored",
        "--exclude-standard",
        "-z",
        "--",
    )
    if result.returncode != 0:
        return {}, False, frozenset()
    ignored_paths = tuple(
        value.decode("utf-8", errors="replace")
        for value in result.stdout.split(b"\0")
        if value
    )
    all_paths = tuple(dict.fromkeys((
        *ignored_paths,
        *(str(path) for path in retained_private_paths if str(path)),
    )))
    complete = len(all_paths) <= MAX_INVENTORY_FILES
    retained = all_paths[:MAX_INVENTORY_FILES]
    return {
        path: _private_git_file_state(repository_root, path)
        for path in retained
    }, complete, frozenset(retained)


def _file_state(
    path: Path,
    repository_root: Path | None,
    *,
    retain_content: bool = True,
) -> _FileState:
    try:
        content = path.read_bytes()
    except (FileNotFoundError, IsADirectoryError, PermissionError, OSError):
        return _FileState(False, "", None, "")
    digest = hashlib.sha256(content).hexdigest()
    retained = (
        content
        if retain_content and len(content) <= MAX_PATCHABLE_FILE_BYTES
        else None
    )
    blob = (
        _git_hash_object(repository_root, content)
        if repository_root is not None else ""
    )
    return _FileState(True, digest, retained, blob)


def _git_is_ignored(repository_root: Path, path: str) -> bool:
    result = _git(
        repository_root,
        "check-ignore",
        "--quiet",
        "--no-index",
        "--",
        path,
    )
    return result.returncode == 0


def _git_tree_file_state(
    repository_root: Path,
    tree: str,
    path: str,
) -> _FileState:
    blob = _git_blob(repository_root, tree, path)
    if not blob:
        return _FileState(False, "", None, "")
    result = _git(repository_root, "cat-file", "blob", blob)
    if result.returncode != 0:
        return _FileState(False, "", None, "")
    content = result.stdout
    retained = content if len(content) <= MAX_PATCHABLE_FILE_BYTES else None
    return _FileState(
        True,
        blob,
        retained,
        blob,
    )


def _private_git_file_state(
    repository_root: Path,
    relative_path: str,
) -> _FileState:
    path = repository_root / relative_path
    try:
        content = path.read_bytes()
    except (FileNotFoundError, IsADirectoryError, PermissionError, OSError):
        return _FileState(False, "", None, "")
    result = subprocess.run(
        (
            "git", "-C", str(repository_root), "hash-object",
            f"--path={relative_path}", "--stdin",
        ),
        input=content,
        capture_output=True,
        check=False,
    )
    digest = (
        result.stdout.decode("ascii", errors="ignore").strip()
        if result.returncode == 0 else hashlib.sha256(content).hexdigest()
    )
    return _FileState(True, digest, None, "")


def _git_hash_object(repository_root: Path, content: bytes) -> str:
    result = subprocess.run(
        ("git", "-C", str(repository_root), "hash-object", "-w", "--stdin"),
        input=content,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        return ""
    return result.stdout.decode("ascii", errors="ignore").strip()


def _content_patch(
    path: str,
    before: _FileState,
    after: _FileState,
) -> tuple[str, bool, bool, int, int]:
    if (before.exists and before.content is None) or (
        after.exists and after.content is None
    ):
        return "", True, True, 0, 0
    before_content = before.content if before.exists else b""
    after_content = after.content if after.exists else b""
    assert before_content is not None and after_content is not None
    try:
        old = before_content.decode("utf-8").splitlines(keepends=True)
        new = after_content.decode("utf-8").splitlines(keepends=True)
    except UnicodeDecodeError:
        return "", True, False, 0, 0
    patch = "".join(
        difflib.unified_diff(
            old,
            new,
            fromfile=f"a/{path}",
            tofile=f"b/{path}",
            n=3,
        )
    )
    additions, deletions = _patch_counts(patch)
    truncated = len(patch) > MAX_PATCH_CHARS
    return patch[:MAX_PATCH_CHARS], False, truncated, additions, deletions


def _patch_counts(patch: str) -> tuple[int, int]:
    additions = sum(
        1 for line in patch.splitlines()
        if line.startswith("+") and not line.startswith("+++")
    )
    deletions = sum(
        1 for line in patch.splitlines()
        if line.startswith("-") and not line.startswith("---")
    )
    return additions, deletions


def _display_path(workspace: Path, path: Path) -> str:
    resolved = path.expanduser().resolve()
    try:
        return resolved.relative_to(workspace).as_posix()
    except ValueError:
        return str(resolved)


def _require_git(
    root: Path,
    *arguments: str,
    env: dict[str, str] | None = None,
) -> str:
    result = _git(root, *arguments, env=env)
    if result.returncode != 0:
        raise ValueError(
            result.stderr.decode("utf-8", errors="replace").strip()
            or result.stdout.decode("utf-8", errors="replace").strip()
            or "Git workspace snapshot failed"
        )
    return result.stdout.decode("utf-8", errors="replace")


def _git(
    root: Path,
    *arguments: str,
    env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(
        ("git", "-C", str(root), *arguments),
        capture_output=True,
        check=False,
        env=env,
    )
