from pydantic import BaseModel, ConfigDict, Field


class ArtifactReadRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    task_id: str = Field(alias="taskId", min_length=1, max_length=160)
    artifact_id: str = Field(alias="artifactId", min_length=1, max_length=64)
    offset: int = Field(default=0, ge=0)
    limit: int = Field(default=20_000, ge=1, le=40_000)


class ArtifactSearchRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    task_id: str = Field(alias="taskId", min_length=1, max_length=160)
    artifact_id: str = Field(alias="artifactId", min_length=1, max_length=64)
    query: str = Field(min_length=1, max_length=500)
    max_results: int = Field(default=20, alias="maxResults", ge=1, le=100)
