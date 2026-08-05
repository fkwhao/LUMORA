from pydantic import BaseModel, ConfigDict, Field

from app.dto.response.chat_completion_response import TokenUsageResponse


class ContextCompactionResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    summary: str
    before_tokens: int = Field(alias="beforeTokens")
    after_tokens: int = Field(alias="afterTokens")
    through_sequence: int | None = Field(alias="throughSequence")
    retained_from_sequence: int | None = Field(alias="retainedFromSequence")
    usage: TokenUsageResponse
