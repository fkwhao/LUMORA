import asyncio
import time
from collections.abc import Iterable, Mapping
from dataclasses import replace
from typing import Any

from app.tool.base import Tool, ToolContext, ToolInput, ToolResult
from app.tool.resource_locks import (
    ResourceAccess,
    ResourceAccessMode,
    ResourceLockManager,
    ResourceObservationStore,
)


class ToolInputError(ValueError):
    pass


class ToolRegistry:
    """工具定义、校验、并发策略与执行的唯一入口。"""

    def __init__(
        self,
        tools: Iterable[Tool] = (),
        *,
        resource_locks: ResourceLockManager | None = None,
        resource_observations: ResourceObservationStore | None = None,
    ) -> None:
        self._tools: dict[str, Tool] = {}
        self._resource_locks = resource_locks or ResourceLockManager()
        self._resource_observations = (
            resource_observations or ResourceObservationStore()
        )
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

    def copy(self) -> "ToolRegistry":
        """Create a request registry that shares cross-run resource locks."""
        return ToolRegistry(
            self._tools.values(),
            resource_locks=self._resource_locks,
            resource_observations=self._resource_observations,
        )

    def select(self, names: Iterable[str]) -> "ToolRegistry":
        """Select tools while retaining the same cross-run lock domain."""
        selected = set(names)
        return ToolRegistry(
            (
                tool
                for name, tool in self._tools.items()
                if name in selected
            ),
            resource_locks=self._resource_locks,
            resource_observations=self._resource_observations,
        )

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

    def validate(
        self,
        name: str,
        input_data: Mapping[str, Any],
    ) -> tuple[Tool, dict[str, Any]]:
        """Validate once before permission evaluation and return normalized input."""
        tool = self.get(name)
        normalized_input = dict(input_data)
        _validate_schema(tool.input_schema, normalized_input)
        semantic_error = tool.validate_input(normalized_input)
        if semantic_error:
            raise ToolInputError(semantic_error)
        return tool, normalized_input

    async def execute(
        self,
        name: str,
        context: ToolContext,
        input_data: Mapping[str, Any],
    ) -> ToolResult:
        tool, normalized_input = self.validate(name, input_data)
        if context.cancelled():
            raise asyncio.CancelledError

        started = time.perf_counter()
        runtime_context = replace(
            context,
            resource_observations=self._resource_observations,
        )
        accesses = tool.resource_accesses(runtime_context, normalized_input)
        try:
            concurrency_safe = (
                tool.is_concurrency_safe(normalized_input) is True
            )
        except Exception:  # noqa: BLE001 - tool scheduling must fail closed
            concurrency_safe = False
        if not accesses and not concurrency_safe:
            key = tool.concurrency_key(runtime_context, normalized_input)
            accesses = (
                ResourceAccess(
                    key or f"tool:{name}",
                    ResourceAccessMode.WRITE,
                ),
            )

        wait_started = time.perf_counter()
        if not accesses:
            resource_wait_ms = 0
            resource_contended = False
            resource_contended_keys: tuple[str, ...] = ()
            result = await tool.execute(runtime_context, normalized_input)
        else:
            async with self._resource_locks.hold(accesses) as lock_report:
                resource_wait_ms = round(
                    (time.perf_counter() - wait_started) * 1000
                )
                resource_contended = lock_report.contended
                resource_contended_keys = lock_report.contended_keys
                if runtime_context.cancelled():
                    raise asyncio.CancelledError
                result = await tool.execute(runtime_context, normalized_input)
        duration_ms = max(1, round((time.perf_counter() - started) * 1000))
        metadata = {
            **dict(result.metadata),
            "durationMs": duration_ms,
            "category": tool.category.value,
            "readOnly": tool.is_read_only(normalized_input),
            "destructive": tool.is_destructive(normalized_input),
            "title": tool.display_title(normalized_input),
            "resourceWaitMs": resource_wait_ms,
            "resourceContended": resource_contended,
            "resourceContendedKeys": resource_contended_keys,
            "resourceAccess": tuple(
                {"key": access.key, "mode": access.mode.value}
                for access in accesses
            ),
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
