from pydantic import BaseModel, ConfigDict, Field

from app.dto.response.plan_step_response import PlanStepResponse


class PlanTaskResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    task_id: str = Field(alias="taskId")
    steps: list[PlanStepResponse]
