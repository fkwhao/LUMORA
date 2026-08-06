from datetime import datetime, timedelta, timezone

from app.dto.request.chat_completion_request import MemoryContextRequest
from app.memory.retrieval import MemoryRetriever


def memory(
    memory_id: str,
    scope: str,
    content: str,
    *,
    importance: float = 0.5,
    confidence: float = 0.9,
    usage_count: int = 0,
    age_days: int = 0,
    last_used_age_days: int | None = None,
) -> MemoryContextRequest:
    return MemoryContextRequest.model_validate({
        "memoryId": memory_id,
        "scope": scope,
        "type": "FACT" if scope != "USER" else "PREFERENCE",
        "content": content,
        "importance": importance,
        "confidence": confidence,
        "usageCount": usage_count,
        "lastUsedTime": (
            None
            if last_used_age_days is None
            else (
                datetime(2026, 8, 6, tzinfo=timezone.utc)
                - timedelta(days=last_used_age_days)
            ).isoformat()
        ),
        "updatedTime": (
            datetime(2026, 8, 6, tzinfo=timezone.utc)
            - timedelta(days=age_days)
        ).isoformat(),
    })


def test_selects_relevant_memories_and_preserves_layers() -> None:
    candidates = [
        memory("user-1", "USER", "用户偏好中文回答"),
        memory(
            "project-1", "PROJECT", "LUMORA 使用 SQLite 持久化 Memory",
            importance=0.9,
        ),
        memory("conversation-1", "CONVERSATION", "当前正在优化 Memory 检索"),
        memory("irrelevant", "PROJECT", "桌面主题颜色是蓝色", importance=0.1),
    ]

    selected = MemoryRetriever().select(
        candidates,
        "继续优化 LUMORA Memory 的 SQLite 检索",
        datetime(2026, 8, 6, tzinfo=timezone.utc),
    )

    assert selected.project_memory == (
        "LUMORA 使用 SQLite 持久化 Memory",
    )
    assert selected.conversation_memory == ("当前正在优化 Memory 检索",)
    assert "irrelevant" not in selected.memory_ids


def test_stable_user_preference_can_be_injected_without_keyword_overlap() -> None:
    selected = MemoryRetriever().select(
        [memory("user-1", "USER", "用户偏好简洁回答", usage_count=5)],
        "检查数据库 migration",
        datetime(2026, 8, 6, tzinfo=timezone.utc),
    )

    assert selected.memory_ids == ("user-1",)


def test_recent_actual_use_contributes_to_ranking() -> None:
    candidates = [
        memory(
            "recently-used", "PROJECT", "项目采用 SQLite",
            age_days=90, last_used_age_days=0,
        ),
        memory("recently-updated", "PROJECT", "项目采用 SQLite", age_days=5),
    ]

    selected = MemoryRetriever().select(
        candidates,
        "项目 SQLite",
        datetime(2026, 8, 6, tzinfo=timezone.utc),
    )

    assert selected.memory_ids[0] == "recently-used"
