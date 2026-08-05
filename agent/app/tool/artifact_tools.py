import json

from app.tool.base import (
    FunctionTool,
    ToolCategory,
    ToolContext,
    ToolInput,
    ToolResult,
    function_tool,
)


def artifact_tools() -> tuple[FunctionTool, ...]:
    return (
        function_tool(
            name="artifact_read",
            description=(
                "分段读取大型工具结果 Artifact。每次最多返回 40000 个字符，"
                "根据 nextOffset 继续读取。"
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "artifactId": {"type": "string"},
                    "offset": {"type": "integer", "minimum": 0},
                    "limit": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 40_000,
                    },
                },
                "required": ["artifactId"],
                "additionalProperties": False,
            },
            category=ToolCategory.FILESYSTEM,
            read_only=True,
            concurrency_safe=True,
            execute=_artifact_read,
            title=lambda data: f"读取 {data.get('artifactId', 'Artifact')}",
        ),
        function_tool(
            name="artifact_search",
            description="在大型工具结果 Artifact 中搜索文本，返回匹配行。",
            input_schema={
                "type": "object",
                "properties": {
                    "artifactId": {"type": "string"},
                    "query": {"type": "string"},
                    "maxResults": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 100,
                    },
                },
                "required": ["artifactId", "query"],
                "additionalProperties": False,
            },
            category=ToolCategory.FILESYSTEM,
            read_only=True,
            concurrency_safe=True,
            execute=_artifact_search,
            title=lambda data: f"搜索 {data.get('artifactId', 'Artifact')}",
        ),
    )


def _artifact_store(context: ToolContext):
    if context.artifact_store is None or not context.task_id:
        raise ValueError("当前运行未配置 Artifact 存储")
    return context.artifact_store


def _artifact_read(context: ToolContext, data: ToolInput) -> ToolResult:
    result = _artifact_store(context).read(
        context.task_id,
        str(data.get("artifactId") or ""),
        offset=int(data.get("offset") or 0),
        limit=int(data.get("limit") or 20_000),
    )
    return ToolResult(
        content=str(result["content"]),
        metadata={key: value for key, value in result.items() if key != "content"},
    )


def _artifact_search(context: ToolContext, data: ToolInput) -> ToolResult:
    result = _artifact_store(context).search(
        context.task_id,
        str(data.get("artifactId") or ""),
        str(data.get("query") or ""),
        max_results=int(data.get("maxResults") or 20),
    )
    return ToolResult(
        content=json.dumps(result, ensure_ascii=False),
        metadata={
            "artifactId": result["artifactId"],
            "matchCount": result["matchCount"],
            "truncated": result["truncated"],
        },
    )
