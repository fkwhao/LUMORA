from app.prompt.prompt_context import PromptContext
from app.prompt.prompt_loader import PromptLoader


class PromptBuilder:
    """组合稳定规则与当前任务上下文，生成最终 System Prompt。"""

    def __init__(self, loader: PromptLoader | None = None) -> None:
        self._loader = loader or PromptLoader()

    def build(self, context: PromptContext | None = None) -> str:
        """构建模型请求使用的完整 System Prompt。"""
        resolved_context = context or PromptContext()
        sections = list(self._loader.load_static_sections())
        sections.append(self._build_runtime_section(resolved_context))
        return "\n\n".join(sections)

    @staticmethod
    def _build_runtime_section(context: PromptContext) -> str:
        lines = [
            "# 当前运行上下文",
            f"- 默认回复语言：{context.response_language}",
        ]
        if context.workspace_path:
            lines.append(f"- 当前工作区：{context.workspace_path}")

        if context.available_tools:
            lines.append("- 当前可用工具：")
            lines.extend(
                f"  - {tool_name}" for tool_name in context.available_tools
            )
        else:
            lines.append("- 当前未向模型注册任何可调用工具。")

        if context.project_instructions:
            lines.append("- 当前项目补充规则：")
            lines.extend(
                f"  - {instruction}"
                for instruction in context.project_instructions
            )
        return "\n".join(lines)
