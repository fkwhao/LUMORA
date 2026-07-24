from pydantic import BaseModel, ConfigDict


class PlanStep(BaseModel):
    model_config = ConfigDict(frozen=True)

    step_id: str
    title: str
    description: str
    requires_approval: bool = False


def build_plan(goal: str) -> list[PlanStep]:
    normalized_goal = goal.strip()
    if not normalized_goal:
        raise ValueError("目标不能为空")

    return [
        PlanStep(
            step_id="understand-goal",
            title="理解目标",
            description=f"分析任务目标：{normalized_goal}",
        ),
        PlanStep(
            step_id="prepare-materials",
            title="整理任务材料",
            description="收集并整理完成目标所需的本地材料。",
        ),
        PlanStep(
            step_id="confirm-sensitive-action",
            title="确认敏感操作",
            description="执行可能影响本地文件的操作前请求用户确认。",
            requires_approval=True,
        ),
        PlanStep(
            step_id="produce-result",
            title="生成结果",
            description="汇总执行结果并提供可验证的成果。",
        ),
    ]

