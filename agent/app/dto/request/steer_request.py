from pydantic import BaseModel, Field


class SteerRequest(BaseModel):
    content: str = Field(min_length=1, max_length=1_000_000)
