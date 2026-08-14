from app.tool.artifact_tools import artifact_tools
from app.tool.filesystem_tools import filesystem_tools
from app.tool.planning_tools import planning_tools
from app.tool.registry import ToolRegistry
from app.tool.shell_tools import shell_tools
from app.tool.skill_tools import skill_tools


def create_default_tool_registry() -> ToolRegistry:
    """按稳定顺序装配内置工具。"""
    return ToolRegistry(
        (
            *planning_tools(),
            *artifact_tools(),
            *filesystem_tools(),
            *shell_tools(),
            *skill_tools(),
        )
    )
