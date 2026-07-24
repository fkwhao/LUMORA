from pydantic import BaseModel, ConfigDict


class PlanStep(BaseModel):
    model_config = ConfigDict(frozen=True)

    step_id: str
    title: str
    description: str
    requires_approval: bool = False
