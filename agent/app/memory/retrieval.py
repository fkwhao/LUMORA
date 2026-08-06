import math
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import ClassVar

from app.dto.request.chat_completion_request import MemoryContextRequest


@dataclass(frozen=True, slots=True)
class MemorySelection:
    user_memory: tuple[str, ...] = ()
    project_memory: tuple[str, ...] = ()
    conversation_memory: tuple[str, ...] = ()
    memory_ids: tuple[str, ...] = ()


class MemoryRetriever:
    """按相关性、重要度、置信度、时效性和使用频率选择记忆。"""

    _SCOPE_LIMITS: ClassVar[dict[str, int]] = {
        "USER": 4,
        "PROJECT": 6,
        "CONVERSATION": 4,
    }
    _MAX_TOTAL = 12
    _MAX_CHARACTERS = 8_000

    def select(
        self,
        candidates: list[MemoryContextRequest],
        query: str,
        now: datetime | None = None,
    ) -> MemorySelection:
        if not candidates:
            return MemorySelection()
        resolved_now = now or datetime.now(timezone.utc)
        query_tokens = self._tokens(query)
        ranked = sorted(
            candidates,
            key=lambda item: (
                self._score(item, query_tokens, resolved_now),
                item.importance,
                self._timestamp(item.updated_time),
            ),
            reverse=True,
        )
        selected: list[MemoryContextRequest] = []
        scope_counts = {scope: 0 for scope in self._SCOPE_LIMITS}
        used_characters = 0
        for item in ranked:
            if len(selected) >= self._MAX_TOTAL:
                break
            score = self._score(item, query_tokens, resolved_now)
            if not self._eligible(item, score, query_tokens):
                continue
            if scope_counts[item.scope] >= self._SCOPE_LIMITS[item.scope]:
                continue
            if used_characters + len(item.content) > self._MAX_CHARACTERS:
                continue
            selected.append(item)
            scope_counts[item.scope] += 1
            used_characters += len(item.content)

        grouped = {
            scope: tuple(item.content for item in selected if item.scope == scope)
            for scope in self._SCOPE_LIMITS
        }
        return MemorySelection(
            user_memory=grouped["USER"],
            project_memory=grouped["PROJECT"],
            conversation_memory=grouped["CONVERSATION"],
            memory_ids=tuple(item.memory_id for item in selected),
        )

    def _score(
        self,
        item: MemoryContextRequest,
        query_tokens: set[str],
        now: datetime,
    ) -> float:
        memory_tokens = self._tokens(item.content)
        overlap = len(query_tokens & memory_tokens)
        relevance = (
            overlap / math.sqrt(len(query_tokens) * len(memory_tokens))
            if query_tokens and memory_tokens
            else 0.0
        )
        recency_time = max(
            value
            for value in (item.updated_time, item.last_used_time)
            if value is not None
        )
        if recency_time.tzinfo is None:
            recency_time = recency_time.replace(tzinfo=timezone.utc)
        age_days = max(0.0, (now - recency_time).total_seconds() / 86_400)
        recency = math.exp(-age_days / 30.0)
        frequency = min(1.0, math.log1p(item.usage_count) / math.log(11))
        return (
            relevance * 0.50
            + item.importance * 0.20
            + item.confidence * 0.15
            + recency * 0.10
            + frequency * 0.05
        )

    def _eligible(
        self,
        item: MemoryContextRequest,
        score: float,
        query_tokens: set[str],
    ) -> bool:
        relevant = bool(query_tokens & self._tokens(item.content))
        if relevant:
            return score >= 0.25
        if item.scope == "USER" and item.type in {"PREFERENCE", "CONSTRAINT"}:
            return score >= 0.30
        return item.importance >= 0.8 and score >= 0.36

    @staticmethod
    def _timestamp(value: datetime) -> float:
        normalized = (
            value.replace(tzinfo=timezone.utc)
            if value.tzinfo is None
            else value
        )
        return normalized.timestamp()

    @staticmethod
    def _tokens(value: str) -> set[str]:
        normalized = value.lower()
        tokens = set(re.findall(r"[a-z0-9_./-]{2,}", normalized))
        for block in re.findall(r"[\u3400-\u9fff]+", normalized):
            if len(block) == 1:
                tokens.add(block)
            else:
                tokens.update(
                    block[index : index + 2]
                    for index in range(len(block) - 1)
                )
        return tokens
