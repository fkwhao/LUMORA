from typing import Self

from pydantic import BaseModel, ConfigDict, Field, model_validator


class TokenUsageResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    prompt_tokens: int = Field(default=0, alias="promptTokens")
    completion_tokens: int = Field(default=0, alias="completionTokens")
    total_tokens: int = Field(default=0, alias="totalTokens")
    input_tokens: int = Field(default=0, alias="inputTokens")
    output_tokens: int = Field(default=0, alias="outputTokens")
    reasoning_tokens: int = Field(default=0, alias="reasoningTokens")
    cache_read_tokens: int = Field(default=0, alias="cacheReadTokens")
    cache_write_tokens: int = Field(default=0, alias="cacheWriteTokens")
    cache_metrics_available: bool = Field(
        default=False,
        alias="cacheMetricsAvailable",
    )

    @model_validator(mode="after")
    def fill_legacy_breakdown(self) -> Self:
        if (
            self.input_tokens == 0
            and self.prompt_tokens > 0
            and not self.cache_metrics_available
            and self.cache_read_tokens == 0
            and self.cache_write_tokens == 0
        ):
            self.input_tokens = self.prompt_tokens
        if (
            self.output_tokens == 0
            and self.completion_tokens > 0
            and self.reasoning_tokens == 0
        ):
            self.output_tokens = self.completion_tokens
        return self


class ChatCompletionResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    message: str
    model: str
    usage: TokenUsageResponse
