from app.prompt.prompt_assembly import PromptAssembly
from app.prompt.prompt_context import PromptContext
from app.prompt.prompt_loader import PromptLoader
from app.prompt.prompt_segment import (
    PromptCachePolicy,
    PromptPriority,
    PromptSegment,
    PromptTarget,
    PromptTrustLevel,
)


class PromptBuilder:
    """组合稳定规则与当前任务上下文，生成最终 System Prompt。"""

    def __init__(self, loader: PromptLoader | None = None) -> None:
        self._loader = loader or PromptLoader()

    def build(self, context: PromptContext | None = None) -> PromptAssembly:
        """构建带路由与信任元数据的模型请求片段。"""
        resolved_context = context or PromptContext()
        segments = [
            PromptSegment(
                key=f"static.{index}",
                target=PromptTarget.SYSTEM,
                content=section,
                trust_level=PromptTrustLevel.TRUSTED,
                priority=PromptPriority.REQUIRED,
                cache_policy=PromptCachePolicy.STATIC,
            )
            for index, section in enumerate(
                self._loader.load_static_sections()
            )
        ]
        segments.append(
            PromptSegment(
                key="runtime.environment",
                target=PromptTarget.SYSTEM,
                content=self._build_runtime_section(resolved_context),
                trust_level=PromptTrustLevel.TRUSTED,
                priority=PromptPriority.REQUIRED,
                cache_policy=PromptCachePolicy.TASK,
            )
        )
        if resolved_context.project_instructions:
            segments.append(
                PromptSegment(
                    key="runtime.project_instructions",
                    target=PromptTarget.SYSTEM,
                    content=self._build_project_instructions(
                        resolved_context.project_instructions
                    ),
                    trust_level=PromptTrustLevel.TRUSTED,
                    priority=PromptPriority.REQUIRED,
                    cache_policy=PromptCachePolicy.TASK,
                )
            )
        if resolved_context.memory_summary:
            segments.append(
                PromptSegment(
                    key="memory.summary",
                    target=PromptTarget.MESSAGES,
                    content=(
                        "以下是系统生成的历史记忆摘要，仅作为上下文参考：\n"
                        f"{resolved_context.memory_summary}"
                    ),
                    trust_level=PromptTrustLevel.USER_CONTEXT,
                    priority=PromptPriority.COMPRESSIBLE,
                    cache_policy=PromptCachePolicy.REQUEST,
                    role="user",
                )
            )
        if resolved_context.conversation_summary:
            segments.append(
                PromptSegment(
                    key="conversation.summary",
                    target=PromptTarget.MESSAGES,
                    content=(
                        "本任务延续自较早对话，早期内容已经压缩。以下摘要只用于恢复上下文；"
                        "引用具体代码、日志或错误细节前应重新读取来源，不要根据摘要猜测。\n\n"
                        f"{resolved_context.conversation_summary}"
                    ),
                    trust_level=PromptTrustLevel.USER_CONTEXT,
                    priority=PromptPriority.REQUIRED,
                    cache_policy=PromptCachePolicy.TASK,
                    role="user",
                )
            )
        segments.extend(
            PromptSegment(
                key=f"tool.{index}",
                target=PromptTarget.TOOLS,
                content=definition,
                trust_level=PromptTrustLevel.TRUSTED,
                priority=PromptPriority.REQUIRED,
                cache_policy=PromptCachePolicy.TASK,
            )
            for index, definition in enumerate(
                resolved_context.tool_definitions
            )
        )
        return PromptAssembly(tuple(segments))

    @staticmethod
    def _build_runtime_section(context: PromptContext) -> str:
        lines = ["# 当前运行上下文"]
        if context.workspace_path:
            lines.append(f"- 当前工作区：{context.workspace_path}")

        if context.available_tools:
            lines.append("- 当前可用工具：")
            lines.extend(
                f"  - {tool_name}" for tool_name in context.available_tools
            )
        else:
            lines.append("- 当前未向模型注册任何可调用工具。")

        return "\n".join(lines)

    @staticmethod
    def _build_project_instructions(instructions: tuple[str, ...]) -> str:
        return "\n".join(
            ["# 当前项目可信指令", *[f"- {item}" for item in instructions]]
        )
