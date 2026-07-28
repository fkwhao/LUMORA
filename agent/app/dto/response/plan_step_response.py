from pydantic import BaseModel, ConfigDict, Field

from app.model.plan_step import PlanStep


class PlanStepResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    step_id: str = Field(alias="stepId")
    title: str
    description: str
    requires_approval: bool = Field(alias="requiresApproval")

    @classmethod
    def from_model(cls, step: PlanStep) -> "PlanStepResponse":
        return cls(
            stepId=step.step_id,
            title=step.title,
            description=step.description,
            requiresApproval=step.requires_approval,
        )
