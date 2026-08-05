from app.tool.artifact_tools import artifact_tools
from app.tool.filesystem_tools import filesystem_tools
from app.tool.registry import ToolRegistry
from app.tool.shell_tools import shell_tools


def create_default_tool_registry() -> ToolRegistry:
    """按稳定顺序装配内置工具。"""
    return ToolRegistry(
        (
            *artifact_tools(),
            *filesystem_tools(),
            *shell_tools(),
        )
    )
