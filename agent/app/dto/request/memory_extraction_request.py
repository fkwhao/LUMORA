from pydantic import BaseModel, ConfigDict, Field

from app.dto.request.chat_completion_request import ModelConnectionRequest


class MemoryExtractionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    user_message: str = Field(alias="userMessage", min_length=1, max_length=20_000)
    assistant_message: str = Field(
        alias="assistantMessage",
        min_length=1,
        max_length=100_000,
    )
    existing_memory_summary: str | None = Field(
        default=None,
        alias="existingMemorySummary",
        max_length=20_000,
    )
    connection: ModelConnectionRequest
