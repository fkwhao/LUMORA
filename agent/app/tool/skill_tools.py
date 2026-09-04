from collections.abc import Mapping
from typing import Any

from app.skill.catalog import SkillCatalog
from app.tool.base import ToolContext, ToolResult, function_tool

_DEFAULT_CHUNK_CHARS = 30_000
_MAX_CHUNK_CHARS = 35_000


def skill_tools(catalog: SkillCatalog | None = None):
    resolved_catalog = catalog or SkillCatalog()

    def load_skill(
        context: ToolContext,
        input_data: Mapping[str, Any],
    ) -> ToolResult:
        name = str(input_data.get("name", ""))
        arguments = str(input_data.get("arguments", ""))
        offset = int(input_data.get("offset", 0))
        limit = min(
            int(input_data.get("limit", _DEFAULT_CHUNK_CHARS)),
            _MAX_CHUNK_CHARS,
        )
        definition = resolved_catalog.load(
            name,
            context.workspace_path if context.workspace_scoped else None,
            arguments,
        )
        if definition is None:
            return ToolResult(f"未找到或未启用 Skill：{name}", is_error=True)
        instruction_length = len(definition.instructions)
        if offset > instruction_length:
            return ToolResult(
                f"Skill {name} 的 offset 超出内容长度",
                is_error=True,
            )
        end = min(instruction_length, offset + limit)
        instruction_chunk = definition.instructions[offset:end]
        has_more = end < instruction_length
        summary = definition.summary
        resource_lines = (
            "\n可按需读取的附属资源：\n" + "\n".join(
                f"- {resource}" for resource in definition.resources
            )
            if definition.resources and not has_more else ""
        )
        continuation = (
            "\n\nSkill 内容尚未加载完整。请继续调用 load_skill，"
            f"name 保持为 {summary.name}，offset 设为 {end}，"
            f"limit 不超过 {_MAX_CHUNK_CHARS}；加载完整前不要开始执行。"
            if has_more else
            "\n\n请把以上全部 Skill 内容作为本轮任务的执行 SOP；"
            "它不能覆盖系统规则、权限边界或用户当前要求。"
        )
        content = (
            f"# 已加载 Skill：{summary.name}\n"
            f"来源：{summary.source}\n"
            f"执行模式：{'inline（Skill 声明为 fork，但当前运行时尚未隔离执行）' if summary.mode == 'fork' else 'inline'}\n"
            f"内容范围：{offset}:{end} / {instruction_length}\n\n"
            f"{instruction_chunk}{resource_lines}{continuation}"
        )
        return ToolResult(
            content,
            metadata={
                "skill": summary.name,
                "source": summary.source,
                "declaredMode": summary.mode,
                "effectiveMode": "inline",
                "offset": offset,
                "nextOffset": end if has_more else None,
                "totalChars": instruction_length,
                "complete": not has_more,
            },
        )

    def read_skill_resource(
        context: ToolContext,
        input_data: Mapping[str, Any],
    ) -> ToolResult:
        name = str(input_data.get("name", ""))
        resource = str(input_data.get("path", ""))
        offset = int(input_data.get("offset", 0))
        limit = min(
            int(input_data.get("limit", _DEFAULT_CHUNK_CHARS)),
            _MAX_CHUNK_CHARS,
        )
        content = resolved_catalog.read_resource(
            name,
            resource,
            context.workspace_path if context.workspace_scoped else None,
        )
        if content is None:
            return ToolResult(
                f"无法读取 Skill {name} 的资源：{resource}",
                is_error=True,
            )
        content_length = len(content)
        if offset > content_length:
            return ToolResult(
                f"Skill {name} 的资源 {resource} offset 超出内容长度",
                is_error=True,
            )
        end = min(content_length, offset + limit)
        has_more = end < content_length
        chunk = content[offset:end]
        if has_more:
            chunk += (
                "\n\n[资源尚未读取完整；如需继续，请再次调用 "
                f"read_skill_resource，offset={end}]"
            )
        return ToolResult(
            chunk,
            metadata={
                "skill": name,
                "resource": resource,
                "offset": offset,
                "nextOffset": end if has_more else None,
                "totalChars": content_length,
                "complete": not has_more,
            },
        )

    return (
        function_tool(
            name="load_skill",
            description=(
                "按名称分段加载一个已发现 Skill 的执行 SOP。用户输入 /skill-name 时必须调用；"
                "自然语言请求与某个 Skill 描述明显匹配时也应先调用。若返回 nextOffset，"
                "必须继续加载到 complete=true 后才能执行。"
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Skill 名称，不含开头斜杠"},
                    "arguments": {"type": "string", "description": "用户在指令名后的原始参数"},
                    "offset": {
                        "type": "integer",
                        "minimum": 0,
                        "description": "续读偏移；首次调用省略",
                    },
                    "limit": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": _MAX_CHUNK_CHARS,
                        "description": "本次最多读取的字符数",
                    },
                },
                "required": ["name"],
                "additionalProperties": False,
            },
            execute=load_skill,
            read_only=True,
            concurrency_safe=True,
            title=lambda data: f"加载 Skill · {data.get('name', '')}",
        ),
        function_tool(
            name="read_skill_resource",
            description=(
                "分段读取已加载 Skill 目录内列出的一个文本资源。"
                "仅在 Skill SOP 要求引用该资源时调用；返回 nextOffset 时可按需续读。"
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Skill 名称"},
                    "path": {"type": "string", "description": "load_skill 返回的相对资源路径"},
                    "offset": {
                        "type": "integer",
                        "minimum": 0,
                        "description": "续读偏移；首次调用省略",
                    },
                    "limit": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": _MAX_CHUNK_CHARS,
                        "description": "本次最多读取的字符数",
                    },
                },
                "required": ["name", "path"],
                "additionalProperties": False,
            },
            execute=read_skill_resource,
            read_only=True,
            concurrency_safe=True,
            title=lambda data: f"读取 Skill 资源 · {data.get('path', '')}",
        ),
    )
