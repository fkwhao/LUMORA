from dataclasses import replace

from app.tool.base import ToolContext, ToolResult

ARTIFACT_RESULT_CHARS = 50_000
ARTIFACT_TURN_CHARS = 200_000
MODEL_VISIBLE_TOOL_RESULT_CHARS = 40_000
ARTIFACT_TOOLS = frozenset({"artifact_read", "artifact_search"})


class ToolResultProcessor:
    """将原始工具结果投影为安全、可控的模型可见结果。"""

    def process(
        self,
        tool_name: str,
        tool_call_id: str,
        result: ToolResult,
        context: ToolContext,
        inline_result_chars: int = 0,
    ) -> ToolResult:
        if self._should_externalize(
            tool_name, result, context, inline_result_chars
        ):
            return self._externalize(tool_call_id, result, context)
        return self._truncate_for_model(result)

    @staticmethod
    def _should_externalize(
        tool_name: str,
        result: ToolResult,
        context: ToolContext,
        inline_result_chars: int,
    ) -> bool:
        return (
            not result.is_error
            and tool_name not in ARTIFACT_TOOLS
            and (
                len(result.content) > ARTIFACT_RESULT_CHARS
                or inline_result_chars + len(result.content) > ARTIFACT_TURN_CHARS
            )
            and context.artifact_store is not None
            and bool(context.task_id)
        )

    @staticmethod
    def _externalize(
        tool_call_id: str,
        result: ToolResult,
        context: ToolContext,
    ) -> ToolResult:
        artifact_store = context.artifact_store
        task_id = context.task_id
        if artifact_store is None or not task_id:
            return result
        record = artifact_store.persist(task_id, result.content)
        preview = (
            "工具结果过大，完整内容已保存。\n"
            f"Artifact: artifact://{record.artifact_id}\n"
            f"大小: {record.byte_size} bytes\n\n"
            "预览：\n"
            f"{record.preview}\n\n"
            "如需更多内容，请使用 artifact_read 分段读取。"
        )
        return replace(
            result,
            content=preview,
            metadata={
                **dict(result.metadata),
                **record.metadata(),
                "sourceToolCallId": tool_call_id,
            },
        )

    @staticmethod
    def _truncate_for_model(result: ToolResult) -> ToolResult:
        if len(result.content) <= MODEL_VISIBLE_TOOL_RESULT_CHARS:
            return result
        omitted = len(result.content) - MODEL_VISIBLE_TOOL_RESULT_CHARS
        head_chars = MODEL_VISIBLE_TOOL_RESULT_CHARS // 2
        tail_chars = MODEL_VISIBLE_TOOL_RESULT_CHARS - head_chars
        content = (
            result.content[:head_chars]
            + f"\n\n…中间省略 {omitted} 个字符（模型输入保护）…\n\n"
            + result.content[-tail_chars:]
        )
        return replace(
            result,
            content=content,
            metadata={
                **dict(result.metadata),
                "modelOutputTruncated": True,
                "originalCharacterCount": len(result.content),
            },
        )
