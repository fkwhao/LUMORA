"""默认工具注册兼容入口。

新代码应从 ``app.tool.default_registry`` 导入装配函数。
"""

from app.tool.default_registry import create_default_tool_registry

__all__ = ["create_default_tool_registry"]
