import json
from collections.abc import Mapping

from app.tool.base import (
    Tool,
    ToolCategory,
    ToolContext,
    ToolInput,
    ToolResult,
    function_tool,
)

_STATUSES = frozenset({"pending", "in_progress", "completed"})
_MAX_STEPS = 20


def planning_tools() -> tuple[Tool, ...]:
    """Tools used by the model to publish a user-visible execution plan."""
    return (
        function_tool(
            name="update_plan",
            description=(
                "Publish or update the execution plan shown to the user. Use this for "
                "multi-step implementation work after inspecting enough context to make "
                "the steps concrete. Send the complete ordered plan on every update."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "steps": {
                        "type": "array",
                        "description": "Complete ordered execution plan.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "step": {"type": "string"},
                                "status": {
                                    "type": "string",
                                    "enum": [
                                        "pending",
                                        "in_progress",
                                        "completed",
                                    ],
                                },
                            },
                            "required": ["step", "status"],
                            "additionalProperties": False,
                        },
                    }
                },
                "required": ["steps"],
                "additionalProperties": False,
            },
            category=ToolCategory.OTHER,
            read_only=True,
            concurrency_safe=False,
            concurrency_key=lambda context, _data: (
                f"task:{context.task_id or context.correlation_id}:plan"
            ),
            validate=_validate_plan,
            execute=_update_plan,
            title=lambda _data: "更新执行计划",
        ),
    )


def _validate_plan(data: ToolInput) -> str | None:
    steps = data.get("steps")
    if not isinstance(steps, list) or not steps:
        return "执行计划必须至少包含一个步骤"
    if len(steps) > _MAX_STEPS:
        return f"执行计划最多包含 {_MAX_STEPS} 个步骤"

    active_count = 0
    for index, raw_step in enumerate(steps):
        if not isinstance(raw_step, Mapping):
            return f"第 {index + 1} 个计划步骤必须是对象"
        label = raw_step.get("step")
        status = raw_step.get("status")
        if not isinstance(label, str) or not label.strip():
            return f"第 {index + 1} 个计划步骤缺少内容"
        if len(label.strip()) > 160:
            return f"第 {index + 1} 个计划步骤超过 160 个字符"
        if status not in _STATUSES:
            return f"第 {index + 1} 个计划步骤状态无效"
        if status == "in_progress":
            active_count += 1
        unknown = set(raw_step) - {"step", "status"}
        if unknown:
            return f"第 {index + 1} 个计划步骤包含未知字段"

    if active_count > 1:
        return "同一时间只能有一个进行中的计划步骤"
    return None


def _update_plan(_context: ToolContext, data: ToolInput) -> ToolResult:
    steps = [
        {
            "step": str(raw_step["step"]).strip(),
            "status": str(raw_step["status"]),
        }
        for raw_step in data["steps"]
    ]
    completed = sum(step["status"] == "completed" for step in steps)
    return ToolResult(
        content=json.dumps(
            {
                "updated": True,
                "completed": completed,
                "total": len(steps),
            },
            ensure_ascii=False,
        ),
        metadata={"planStepCount": len(steps)},
    )
