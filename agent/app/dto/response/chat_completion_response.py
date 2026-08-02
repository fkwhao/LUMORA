from pydantic import BaseModel, ConfigDict, Field


class TokenUsageResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    prompt_tokens: int = Field(default=0, alias="promptTokens")
    completion_tokens: int = Field(default=0, alias="completionTokens")
    total_tokens: int = Field(default=0, alias="totalTokens")


class ChatCompletionResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    message: str
    model: str
    usage: TokenUsageResponse
