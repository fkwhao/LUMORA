import asyncio
import inspect
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path
from typing import Any, Protocol

from app.tool.resource_locks import ResourceAccess, ResourceObservationStore

ToolInput = Mapping[str, Any]
ToolExecutor = Callable[["ToolContext", ToolInput], "ToolResult | Awaitable[ToolResult]"]
InputPredicate = bool | Callable[[ToolInput], bool]
ResourceAccessFactory = Callable[
    ["ToolContext", ToolInput],
    tuple[ResourceAccess, ...],
]


class ToolCategory(StrEnum):
    FILESYSTEM = "filesystem"
    SHELL = "shell"
    NETWORK = "network"
    OTHER = "other"


@dataclass(frozen=True, slots=True)
class ToolContext:
    workspace_path: Path
    workspace_scoped: bool = True
    correlation_id: str = ""
    task_id: str = ""
    artifact_store: Any | None = field(default=None, repr=False)
    resource_observations: ResourceObservationStore | None = field(
        default=None,
        repr=False,
    )
    allow_external_paths: bool = False
    cancelled: Callable[[], bool] = field(default=lambda: False, repr=False)


@dataclass(frozen=True, slots=True)
class ToolResult:
    content: str
    is_error: bool = False
    metadata: Mapping[str, Any] = field(default_factory=dict)


class Tool(Protocol):
    @property
    def name(self) -> str: ...

    @property
    def description(self) -> str: ...

    @property
    def input_schema(self) -> Mapping[str, Any]: ...

    @property
    def category(self) -> ToolCategory: ...

    def is_read_only(self, input_data: ToolInput) -> bool: ...

    def is_destructive(self, input_data: ToolInput) -> bool: ...

    def is_concurrency_safe(self, input_data: ToolInput) -> bool: ...

    def concurrency_key(
        self,
        context: ToolContext,
        input_data: ToolInput,
    ) -> str | None: ...

    def resource_accesses(
        self,
        context: ToolContext,
        input_data: ToolInput,
    ) -> tuple[ResourceAccess, ...]: ...

    def validate_input(self, input_data: ToolInput) -> str | None: ...

    def display_title(self, input_data: ToolInput) -> str: ...

    def to_model_definition(self) -> dict[str, Any]: ...

    async def execute(
        self,
        context: ToolContext,
        input_data: ToolInput,
    ) -> ToolResult: ...


@dataclass(frozen=True, slots=True)
class FunctionTool:
    name: str
    description: str
    input_schema: Mapping[str, Any]
    executor: ToolExecutor = field(repr=False)
    category: ToolCategory = ToolCategory.OTHER
    read_only: InputPredicate = False
    destructive: InputPredicate = False
    concurrency_safe: InputPredicate = False
    concurrency_key_factory: (
        Callable[[ToolContext, ToolInput], str | None] | None
    ) = field(default=None, repr=False)
    resource_access_factory: ResourceAccessFactory | None = field(
        default=None,
        repr=False,
    )
    validator: Callable[[ToolInput], str | None] | None = field(
        default=None,
        repr=False,
    )
    title_factory: Callable[[ToolInput], str] | None = field(
        default=None,
        repr=False,
    )

    def is_read_only(self, input_data: ToolInput) -> bool:
        return _resolve_predicate(self.read_only, input_data)

    def is_destructive(self, input_data: ToolInput) -> bool:
        return _resolve_predicate(self.destructive, input_data)

    def is_concurrency_safe(self, input_data: ToolInput) -> bool:
        return _resolve_predicate(self.concurrency_safe, input_data)

    def concurrency_key(
        self,
        context: ToolContext,
        input_data: ToolInput,
    ) -> str | None:
        if self.concurrency_key_factory is None:
            return None
        return self.concurrency_key_factory(context, input_data)

    def resource_accesses(
        self,
        context: ToolContext,
        input_data: ToolInput,
    ) -> tuple[ResourceAccess, ...]:
        if self.resource_access_factory is None:
            return ()
        return self.resource_access_factory(context, input_data)

    def validate_input(self, input_data: ToolInput) -> str | None:
        return self.validator(input_data) if self.validator else None

    def display_title(self, input_data: ToolInput) -> str:
        return self.title_factory(input_data) if self.title_factory else self.name

    async def execute(
        self,
        context: ToolContext,
        input_data: ToolInput,
    ) -> ToolResult:
        result: ToolResult | Awaitable[ToolResult]
        if inspect.iscoroutinefunction(self.executor):
            result = self.executor(context, input_data)
        else:
            result = await asyncio.to_thread(
                _call_tool_executor,
                self.executor,
                context,
                input_data,
            )
        if inspect.isawaitable(result):
            result = await result
        if not isinstance(result, ToolResult):
            raise TypeError(f"工具 {self.name} 返回了无效结果")
        return result

    def to_model_definition(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": dict(self.input_schema),
            },
        }


def function_tool(
    *,
    name: str,
    description: str,
    input_schema: Mapping[str, Any],
    execute: ToolExecutor,
    category: ToolCategory = ToolCategory.OTHER,
    read_only: InputPredicate = False,
    destructive: InputPredicate = False,
    concurrency_safe: InputPredicate = False,
    concurrency_key: (
        Callable[[ToolContext, ToolInput], str | None] | None
    ) = None,
    resource_accesses: ResourceAccessFactory | None = None,
    validate: Callable[[ToolInput], str | None] | None = None,
    title: Callable[[ToolInput], str] | None = None,
) -> FunctionTool:
    return FunctionTool(
        name=name,
        description=description,
        input_schema=dict(input_schema),
        executor=execute,
        category=category,
        read_only=read_only,
        destructive=destructive,
        concurrency_safe=concurrency_safe,
        concurrency_key_factory=concurrency_key,
        resource_access_factory=resource_accesses,
        validator=validate,
        title_factory=title,
    )


def _resolve_predicate(predicate: InputPredicate, input_data: ToolInput) -> bool:
    return predicate(input_data) if callable(predicate) else predicate


def _call_tool_executor(
    executor: ToolExecutor,
    context: ToolContext,
    input_data: ToolInput,
) -> ToolResult | Awaitable[ToolResult]:
    return executor(context, input_data)
