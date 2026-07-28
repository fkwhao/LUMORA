from pydantic import BaseModel, ConfigDict, Field


class ErrorResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    code: str
    message: str
    retryable: bool
    correlation_id: str = Field(alias="correlationId")
