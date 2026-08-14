from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.dto.response.chat_completion_response import TokenUsageResponse


class MemoryCandidateResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    action: Literal["UPSERT", "ARCHIVE"] = "UPSERT"
    storage: Literal["MEMORY", "PROJECT_INSTRUCTIONS"] = "MEMORY"
    scope: Literal["USER", "PROJECT", "CONVERSATION"]
    type: Literal[
        "PREFERENCE",
        "FACT",
        "DECISION",
        "CONSTRAINT",
        "SUMMARY",
    ]
    retention: Literal["SHORT_TERM", "LONG_TERM"]
    content: str = Field(min_length=1, max_length=4_000)
    dedupe_key: str = Field(
        alias="dedupeKey",
        min_length=1,
        max_length=240,
        pattern=r"^[a-z0-9][a-z0-9._-]*$",
    )
    subject: str = Field(min_length=1, max_length=500)
    predicate: str = Field(min_length=1, max_length=240)
    value: str = Field(min_length=1, max_length=2_000)
    target_memory_id: str | None = Field(
        default=None,
        alias="targetMemoryId",
        max_length=100,
    )
    structured_data: dict[str, Any] = Field(
        default_factory=dict,
        alias="structuredData",
    )
    confidence: float = Field(ge=0.0, le=1.0)
    importance: float = Field(default=0.5, ge=0.0, le=1.0)
    ttl_seconds: int | None = Field(
        default=None,
        alias="ttlSeconds",
        ge=60,
        le=2_592_000,
    )


class MemoryExtractionResponse(BaseModel):
    candidates: list[MemoryCandidateResponse] = Field(
        default_factory=list,
        max_length=8,
    )
    model: str = ""
    usage: TokenUsageResponse = Field(default_factory=TokenUsageResponse)
