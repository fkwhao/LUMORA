from pydantic import BaseModel, ConfigDict, Field


class PlanTaskRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    task_id: str = Field(alias="taskId", min_length=1)
    goal: str = Field(min_length=1)
