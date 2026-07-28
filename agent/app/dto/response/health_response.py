from pydantic import BaseModel, ConfigDict, Field


class HealthResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    status: str
    service: str
    protocol_version: str = Field(alias="protocolVersion")
