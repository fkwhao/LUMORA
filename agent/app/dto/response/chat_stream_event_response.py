from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.dto.response.chat_completion_response import TokenUsageResponse


class ChatStreamEventResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    type: Literal[
        "text_delta",
        "reasoning_delta",
        "usage",
        "completed",
        "failed",
    ]
    delta: str = ""
    model: str = ""
    usage: TokenUsageResponse | None = None
    error_message: str = Field(default="", alias="errorMessage")
