import asyncio
import json
import time
from collections.abc import Iterable, Mapping
from dataclasses import replace
from typing import Any

from app.execution.workspace_changes import WorkspaceChangeLedger
from app.execution.write_intents import (
    WriteIntentManager,
    scopes_from_resource_accesses,
)
from app.tool.base import Tool, ToolContext, ToolInput, ToolResult
from app.tool.resource_locks import (
    ResourceAccess,
    ResourceAccessMode,
    ResourceLockManager,
    ResourceObservationStore,
    workspace_resource_key,
)


class ToolInputError(ValueError):
    pass


class WorkspacePartialEffectError(ValueError):
    """A failed tool changed files and therefore requires explicit review."""

    def __init__(
        self,
        cause: BaseException,
        metadata: Mapping[str, Any],
    ) -> None:
        super().__init__(str(cause) or type(cause).__name__)
        self.cause = cause
        self.metadata = dict(metadata)


class ToolRegistry:
    """工具定义、校验、并发策略与执行的唯一入口。"""

    def __init__(
        self,
        tools: Iterable[Tool] = (),
        *,
        resource_locks: ResourceLockManager | None = None,
        resource_observations: ResourceObservationStore | None = None,
        write_intents: WriteIntentManager | None = None,
        workspace_changes: WorkspaceChangeLedger | None = None,
    ) -> None:
        self._tools: dict[str, Tool] = {}
        self._resource_locks = resource_locks or ResourceLockManager()
        self._resource_observations = (
            resource_observations or ResourceObservationStore()
        )
        self._write_intents = write_intents or WriteIntentManager()
        self._workspace_changes = workspace_changes or WorkspaceChangeLedger()
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
            write_intents=self._write_intents,
            workspace_changes=self._workspace_changes,
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
            write_intents=self._write_intents,
            workspace_changes=self._workspace_changes,
        )

    @property
    def write_intents(self) -> WriteIntentManager:
        return self._write_intents

    def begin_workspace_run(self, context: ToolContext) -> int:
        return self._workspace_changes.begin_run(
            context.workspace_path,
            context.correlation_id or context.session_id or context.task_id,
        )

    def consume_workspace_updates(
        self,
        context: ToolContext,
    ) -> tuple[int, tuple[dict[str, Any], ...]]:
        revision, events = self._workspace_changes.consume_external(
            context.workspace_path,
            context.correlation_id or context.session_id or context.task_id,
        )
        return revision, tuple(event.notice_metadata() for event in events)

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
        if not accesses:
            key = tool.concurrency_key(runtime_context, normalized_input)
            if key:
                fallback_key = key
                fallback_mode = ResourceAccessMode.WRITE
            else:
                fallback_key = workspace_resource_key(
                    runtime_context.workspace_path
                )
                fallback_mode = (
                    ResourceAccessMode.READ
                    if tool.is_read_only(normalized_input)
                    else ResourceAccessMode.WRITE
                )
            accesses = (
                ResourceAccess(
                    fallback_key,
                    fallback_mode,
                ),
            )

        wait_started = time.perf_counter()
        write_scopes = scopes_from_resource_accesses(accesses)
        owner_id = (
            runtime_context.resource_owner_id
            or runtime_context.correlation_id
            or "local"
        )
        with self._write_intents.hold(
            owner_id,
            write_scopes,
            owner_label=runtime_context.agent_id or owner_id,
        ) as write_claim:
            self._write_intents.ensure_current(owner_id, write_scopes)
            result: ToolResult | None = None
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
                    workspace_write = any(
                        access.mode == ResourceAccessMode.WRITE
                        and access.key.startswith("workspace:")
                        for access in accesses
                    )
                    run_id = (
                        runtime_context.correlation_id
                        or runtime_context.session_id
                        or runtime_context.task_id
                    )
                    stale, current_revision = (
                        self._workspace_changes.has_foreign_change_after(
                            runtime_context.workspace_path,
                            run_id,
                            runtime_context.workspace_revision,
                        )
                        if workspace_write else (False, -1)
                    )
                    if stale:
                        duration_ms = max(
                            1,
                            round((time.perf_counter() - started) * 1000),
                        )
                        return ToolResult(
                            content=json.dumps(
                                {
                                    "ok": False,
                                    "errorCode": "stale_workspace_version",
                                    "message": (
                                        "工作区在命令等待执行期间已被其他任务更新；"
                                        "请先读取最新状态并重新规划"
                                    ),
                                    "expectedRevision": (
                                        runtime_context.workspace_revision
                                    ),
                                    "currentRevision": current_revision,
                                    "retryable": True,
                                    "toolExecutionState": "not_started",
                                    "nextAction": "refresh_and_replan",
                                },
                                ensure_ascii=False,
                            ),
                            is_error=True,
                            metadata={
                                "durationMs": duration_ms,
                                "category": tool.category.value,
                                "readOnly": tool.is_read_only(normalized_input),
                                "destructive": tool.is_destructive(
                                    normalized_input
                                ),
                                "title": tool.display_title(normalized_input),
                                "failureKind": "stale_workspace_version",
                                "retryable": True,
                                "toolExecutionState": "not_started",
                                "workspaceRevision": current_revision,
                                "resourceWaitMs": resource_wait_ms,
                                "resourceContended": resource_contended,
                                "resourceContendedKeys": (
                                    resource_contended_keys
                                ),
                                "resourceAccess": tuple(
                                    {
                                        "key": access.key,
                                        "mode": access.mode.value,
                                    }
                                    for access in accesses
                                ),
                                "writeLease": (
                                    write_claim.metadata(state="released")
                                    if write_claim is not None
                                    else {"state": "shared_owner"}
                                ),
                            },
                        )
                    mutation_snapshot = None
                    if any(
                        access.mode == ResourceAccessMode.WRITE
                        for access in accesses
                    ):
                        mutation_snapshot = await asyncio.to_thread(
                            self._workspace_changes.capture,
                            runtime_context.workspace_path,
                            accesses,
                        )
                    execution_error: Exception | None = None
                    execution_cancelled: asyncio.CancelledError | None = None
                    try:
                        result = await tool.execute(
                            runtime_context,
                            normalized_input,
                        )
                    except asyncio.CancelledError as error:
                        execution_cancelled = error
                    except Exception as error:  # noqa: BLE001
                        execution_error = error
                    change_metadata: dict[str, Any] = {}
                    if mutation_snapshot is not None:
                        after_task = asyncio.create_task(asyncio.to_thread(
                                self._workspace_changes.capture,
                                runtime_context.workspace_path,
                                accesses,
                                mutation_snapshot.private_paths,
                        ))
                        try:
                            after_snapshot = await asyncio.shield(after_task)
                        except asyncio.CancelledError as error:
                            execution_cancelled = execution_cancelled or error
                            after_snapshot = await after_task
                        compare_task = asyncio.create_task(asyncio.to_thread(
                                self._workspace_changes.compare,
                                mutation_snapshot,
                                after_snapshot,
                        ))
                        try:
                            changes = await asyncio.shield(compare_task)
                        except asyncio.CancelledError as error:
                            execution_cancelled = execution_cancelled or error
                            changes = await compare_task
                        revision, recorded = self._workspace_changes.record(
                            workspace_path=runtime_context.workspace_path,
                            repository_root=after_snapshot.repository_root,
                            task_id=runtime_context.task_id,
                            run_id=(
                                runtime_context.correlation_id
                                or runtime_context.session_id
                                or runtime_context.task_id
                            ),
                            agent_id=runtime_context.agent_id,
                            changes=changes,
                        )
                        change_set_complete = (
                            mutation_snapshot.complete
                            and after_snapshot.complete
                            and all(
                                bool(change.get("attributionComplete", True))
                                for change in changes
                            )
                            and len(recorded) == len(changes)
                        )
                        change_metadata = {
                            "workspaceRevision": revision,
                            "workspaceChangeCount": len(recorded),
                            "workspaceChangeSetComplete": (
                                change_set_complete
                            ),
                            "workspaceChangeFilesTruncated": (
                                not change_set_complete
                            ),
                            "workspaceChangesTruncated": (
                                not change_set_complete
                                or any(event.truncated for event in recorded)
                            ),
                            "workspaceChanges": tuple(
                                event.metadata() for event in recorded
                            ),
                        }
                    if execution_cancelled is not None:
                        if (
                            change_metadata.get("workspaceChangeCount", 0)
                            or change_metadata.get(
                                "workspaceChangeSetComplete", True
                            ) is False
                        ):
                            raise WorkspacePartialEffectError(
                                execution_cancelled,
                                {
                                    **change_metadata,
                                    "failureKind": (
                                        "partial_effect_review_required"
                                    ),
                                    "retryable": False,
                                    "toolExecutionState": "partial_effect",
                                },
                            ) from execution_cancelled
                        raise execution_cancelled
                    if execution_error is not None:
                        if (
                            change_metadata.get("workspaceChangeCount", 0)
                            or change_metadata.get(
                                "workspaceChangeSetComplete", True
                            ) is False
                        ):
                            raise WorkspacePartialEffectError(
                                execution_error,
                                {
                                    **change_metadata,
                                    "failureKind": (
                                        "partial_effect_review_required"
                                    ),
                                    "retryable": False,
                                    "toolExecutionState": "partial_effect",
                                },
                            ) from execution_error
                        raise execution_error
                    assert result is not None
                    if change_metadata:
                        result = replace(
                            result,
                            metadata={
                                **dict(result.metadata),
                                **change_metadata,
                            },
                        )
        assert result is not None
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
        if write_claim is not None:
            metadata["writeLease"] = write_claim.metadata(state="released")
        if runtime_context.workflow_id:
            metadata["workflowId"] = runtime_context.workflow_id
        if runtime_context.workflow_node_id:
            metadata["workflowNodeId"] = runtime_context.workflow_node_id
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
