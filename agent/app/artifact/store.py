import hashlib
import os
import re
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path

ARTIFACT_ID_PATTERN = re.compile(r"^art_[0-9a-f]{32}$")
DEFAULT_PREVIEW_CHARS = 2_000
DEFAULT_READ_CHARS = 20_000
MAX_READ_CHARS = 40_000


@dataclass(frozen=True, slots=True)
class ArtifactRecord:
    artifact_id: str
    task_id: str
    mime_type: str
    byte_size: int
    character_count: int
    estimated_tokens: int
    sha256: str
    preview: str

    def metadata(self) -> dict[str, object]:
        return {
            "artifactId": self.artifact_id,
            "artifactScopeId": self.task_id,
            "artifactUri": f"artifact://{self.artifact_id}",
            "artifactMimeType": self.mime_type,
            "artifactByteSize": self.byte_size,
            "artifactCharacterCount": self.character_count,
            "artifactEstimatedTokens": self.estimated_tokens,
            "artifactSha256": self.sha256,
            "artifactTruncated": True,
        }


class ArtifactStore:
    """按任务隔离的大型文本结果存储；模型只接触不透明 Artifact ID。"""

    def __init__(self, root: Path | None = None) -> None:
        self._root = (root or self.default_root()).expanduser().resolve()
        try:
            self._root.mkdir(parents=True, exist_ok=True)
        except OSError:
            if root is not None:
                raise
            self._root = (
                Path(tempfile.gettempdir()) / "lumora" / "artifacts"
            ).resolve()
            self._root.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def default_root() -> Path:
        configured = os.environ.get("LUMORA_ARTIFACT_ROOT", "").strip()
        if configured:
            return Path(configured)
        local_app_data = os.environ.get("LOCALAPPDATA", "").strip()
        if local_app_data:
            return Path(local_app_data) / "LUMORA" / "artifacts"
        return Path(tempfile.gettempdir()) / "lumora" / "artifacts"

    def persist(
        self,
        task_id: str,
        content: str,
        *,
        mime_type: str = "text/plain",
    ) -> ArtifactRecord:
        normalized_task_id = self._safe_component(task_id, "任务 ID")
        artifact_id = f"art_{uuid.uuid4().hex}"
        payload = content.encode("utf-8")
        directory = self._root / normalized_task_id
        directory.mkdir(parents=True, exist_ok=True)
        destination = directory / f"{artifact_id}.txt"
        temporary = directory / f".{artifact_id}.tmp"
        temporary.write_bytes(payload)
        temporary.replace(destination)
        return ArtifactRecord(
            artifact_id=artifact_id,
            task_id=normalized_task_id,
            mime_type=mime_type,
            byte_size=len(payload),
            character_count=len(content),
            estimated_tokens=max(1, (len(payload) + 3) // 4),
            sha256=hashlib.sha256(payload).hexdigest(),
            preview=content[:DEFAULT_PREVIEW_CHARS],
        )

    def read(
        self,
        task_id: str,
        artifact_id: str,
        *,
        offset: int = 0,
        limit: int = DEFAULT_READ_CHARS,
    ) -> dict[str, object]:
        content = self._path(task_id, artifact_id).read_text(encoding="utf-8")
        safe_offset = max(0, offset)
        safe_limit = min(MAX_READ_CHARS, max(1, limit))
        chunk = content[safe_offset : safe_offset + safe_limit]
        next_offset = safe_offset + len(chunk)
        return {
            "artifactId": artifact_id,
            "content": chunk,
            "offset": safe_offset,
            "nextOffset": next_offset if next_offset < len(content) else None,
            "hasMore": next_offset < len(content),
            "characterCount": len(content),
        }

    def search(
        self,
        task_id: str,
        artifact_id: str,
        query: str,
        *,
        max_results: int = 20,
    ) -> dict[str, object]:
        needle = query.strip().casefold()
        if not needle:
            raise ValueError("搜索文本不能为空")
        content = self._path(task_id, artifact_id).read_text(encoding="utf-8")
        matches: list[dict[str, object]] = []
        total = 0
        for line_number, line in enumerate(content.splitlines(), start=1):
            if needle not in line.casefold():
                continue
            total += 1
            if len(matches) < min(100, max(1, max_results)):
                matches.append({"line": line_number, "content": line[:2_000]})
        return {
            "artifactId": artifact_id,
            "query": query,
            "matches": matches,
            "matchCount": total,
            "truncated": total > len(matches),
        }

    def _path(self, task_id: str, artifact_id: str) -> Path:
        normalized_task_id = self._safe_component(task_id, "任务 ID")
        if not ARTIFACT_ID_PATTERN.fullmatch(artifact_id):
            raise ValueError("Artifact ID 无效")
        path = (self._root / normalized_task_id / f"{artifact_id}.txt").resolve()
        expected_parent = (self._root / normalized_task_id).resolve()
        if path.parent != expected_parent or not path.is_file():
            raise ValueError("Artifact 不存在或不属于当前任务")
        return path

    @staticmethod
    def _safe_component(value: str, label: str) -> str:
        normalized = value.strip()
        if not normalized or not re.fullmatch(r"[A-Za-z0-9_-]{1,160}", normalized):
            raise ValueError(f"{label}无效")
        return normalized
