import asyncio
import time
from collections.abc import Iterable, Mapping
from dataclasses import replace
from typing import Any

from app.tool.base import Tool, ToolContext, ToolInput, ToolResult


class ToolInputError(ValueError):
    pass


class ToolRegistry:
    """工具定义、校验、并发策略与执行的唯一入口。"""

    def __init__(self, tools: Iterable[Tool] = ()) -> None:
        self._tools: dict[str, Tool] = {}
        self._locks: dict[str, asyncio.Lock] = {}
        for tool in tools:
            self.register(tool)

    def register(self, tool: Tool) -> None:
        name = tool.name.strip()
        if not name:
            raise ValueError("工具名称不能为空")
        if name in self._tools:
            raise ValueError(f"工具名称重复：{name}")
        if not tool.description.strip():
            raise ValueError(f"工具 {name} 缺少描述")
        self._tools[name] = tool

    def get(self, name: str) -> Tool:
        try:
            return self._tools[name]
        except KeyError as error:
            raise ValueError(f"未注册的工具：{name}") from error

    def names(self) -> tuple[str, ...]:
        return tuple(self._tools)

    def model_definitions(
        self,
        allowed_names: Iterable[str] | None = None,
    ) -> tuple[dict[str, Any], ...]:
        allowed = set(allowed_names) if allowed_names is not None else None
        return tuple(
            tool.to_model_definition()
            for name, tool in self._tools.items()
            if allowed is None or name in allowed
        )

    def display_title(self, name: str, input_data: ToolInput) -> str:
        return self.get(name).display_title(input_data)

    async def execute(
        self,
        name: str,
        context: ToolContext,
        input_data: Mapping[str, Any],
    ) -> ToolResult:
        tool = self.get(name)
        normalized_input = dict(input_data)
        _validate_schema(tool.input_schema, normalized_input)
        semantic_error = tool.validate_input(normalized_input)
        if semantic_error:
            raise ToolInputError(semantic_error)
        if context.cancelled():
            raise asyncio.CancelledError

        started = time.perf_counter()
        if tool.is_concurrency_safe(normalized_input):
            result = await tool.execute(context, normalized_input)
        else:
            key = tool.concurrency_key(context, normalized_input)
            lock_key = key or f"tool:{name}"
            lock = self._locks.setdefault(lock_key, asyncio.Lock())
            async with lock:
                result = await tool.execute(context, normalized_input)
        duration_ms = max(1, round((time.perf_counter() - started) * 1000))
        metadata = {
            **dict(result.metadata),
            "durationMs": duration_ms,
            "category": tool.category.value,
            "readOnly": tool.is_read_only(normalized_input),
            "destructive": tool.is_destructive(normalized_input),
            "title": tool.display_title(normalized_input),
        }
        return replace(result, metadata=metadata)


def _validate_schema(
    schema: Mapping[str, Any],
    input_data: Mapping[str, Any],
) -> None:
    if schema.get("type") != "object":
        raise ToolInputError("工具输入 Schema 根节点必须是 object")
    properties = schema.get("properties") or {}
    required = schema.get("required") or []
    for name in required:
        if name not in input_data:
            raise ToolInputError(f"缺少必填参数：{name}")
    if schema.get("additionalProperties") is False:
        unknown = set(input_data) - set(properties)
        if unknown:
            raise ToolInputError(f"包含未知参数：{min(unknown)}")
    for name, value in input_data.items():
        property_schema = properties.get(name)
        if isinstance(property_schema, Mapping):
            _validate_value(name, value, property_schema)


def _validate_value(
    name: str,
    value: Any,
    schema: Mapping[str, Any],
) -> None:
    expected = schema.get("type")
    valid = (
        expected == "string" and isinstance(value, str)
        or expected == "integer"
        and isinstance(value, int)
        and not isinstance(value, bool)
        or expected == "boolean" and isinstance(value, bool)
        or expected == "object" and isinstance(value, Mapping)
        or expected == "array" and isinstance(value, list)
        or expected is None
    )
    if not valid:
        raise ToolInputError(f"参数 {name} 类型无效")
    if isinstance(value, int):
        if "minimum" in schema and value < int(schema["minimum"]):
            raise ToolInputError(f"参数 {name} 小于最小值")
        if "maximum" in schema and value > int(schema["maximum"]):
            raise ToolInputError(f"参数 {name} 超过最大值")
