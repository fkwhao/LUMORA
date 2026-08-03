from pydantic import BaseModel, ConfigDict, Field


class ModelListRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    provider_name: str = Field(
        alias="providerName",
        min_length=1,
        max_length=80,
    )
    base_url: str = Field(alias="baseUrl", min_length=1, max_length=500)
    api_key: str = Field(alias="apiKey", min_length=1, max_length=2048)
