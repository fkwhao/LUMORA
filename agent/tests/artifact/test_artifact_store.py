from pathlib import Path

import pytest
from app.artifact.store import ArtifactStore


def test_artifact_store_persists_reads_and_searches_by_task(tmp_path: Path) -> None:
    store = ArtifactStore(tmp_path)
    content = "第一行\n关键字 alpha\n" + "尾部" * 20_000

    record = store.persist("task-1", content)
    first = store.read("task-1", record.artifact_id, limit=12)
    matches = store.search("task-1", record.artifact_id, "ALPHA")

    assert record.artifact_id.startswith("art_")
    assert first["content"] == content[:12]
    assert first["hasMore"] is True
    assert matches["matchCount"] == 1
    assert matches["matches"][0]["line"] == 2

    with pytest.raises(ValueError, match="不属于当前任务"):
        store.read("task-2", record.artifact_id)


def test_artifact_store_rejects_path_like_ids(tmp_path: Path) -> None:
    store = ArtifactStore(tmp_path)

    with pytest.raises(ValueError, match="Artifact ID 无效"):
        store.read("task-1", "../../secret")
