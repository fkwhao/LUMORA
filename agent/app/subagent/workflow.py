from __future__ import annotations

import asyncio
import json
import re
import time
import uuid
from collections.abc import Sequence
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from typing import Any

from app.dto.request.chat_completion_request import ChatMessageRequest
from app.execution.write_intents import (
    WriteScope,
    declared_write_scopes,
    write_scope_sets_overlap,
)
from app.harness.run_event import RunEvent
from app.subagent.runtime import SubagentRuntime
from app.tool.base import (
    ToolCategory,
    ToolContext,
    ToolInput,
    ToolResult,
    function_tool,
)

_NODE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$")
_MAX_GRAPHS = 20
_MAX_NODES = 64


@dataclass(slots=True)
class WorkflowNode:
    node_id: str
    title: str
    prompt: str
    depends_on: tuple[str, ...] = ()
    priority: int = 0
    deadline: datetime | None = None
    max_attempts: int = 1
    retry_mode: str = "never"
    declared_scope_values: tuple[str, ...] = ()
    write_scopes: tuple[WriteScope, ...] = ()
    evidence_refs: tuple[str, ...] = ()
    status: str = "pending"
    attempts: int = 0
    result: str = ""
    error: str = ""
    failure_kind: str = ""
    agent_id: str = ""
    session_id: str = ""
    effect_id: str = ""
    effect_state: str = "not_started"
    dispatch_count: int = 0
    dispatch_sequence: int = 0
    ready_since: datetime | None = None
    duration_ms: int = 0


@dataclass(slots=True)
class WorkflowQuota:
    max_waves: int = 256
    max_total_attempts: int = 1024
    max_runtime_ms: int = 7 * 24 * 60 * 60 * 1000
    used_waves: int = 0
    used_attempts: int = 0
    used_runtime_ms: int = 0


@dataclass(slots=True)
class WorkflowGraph:
    graph_id: str
    label: str
    owner_agent_id: str
    nodes: dict[str, WorkflowNode] = field(default_factory=dict)
    version: int = 0
    scheduler_sequence: int = 0
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    quota: WorkflowQuota = field(default_factory=WorkflowQuota)
    quota_exhausted: bool = False


class WorkflowManager:
    """Optional explicit DAG planner backed by the existing Agent Runtime."""

    def __init__(
        self,
        runtime: SubagentRuntime,
        durable_snapshots: Sequence[dict[str, Any]] = (),
    ) -> None:
        self._runtime = runtime
        self._graphs: dict[str, WorkflowGraph] = {}
        self._durable_snapshots = tuple(durable_snapshots)
        self._durable_restored = False
        self._created_graphs = 0

    def tools(self):
        return (
            create_workflow_tool(self),
            create_list_workflows_tool(self),
            create_run_workflow_tool(self),
            create_retry_workflow_node_tool(self),
        )

    def restore_from_messages(
        self,
        messages: Sequence[ChatMessageRequest],
        context: ToolContext,
    ) -> int:
        """Restore the latest graph snapshots from persisted tool messages."""
        workflow_calls: dict[str, str] = {}
        restored: set[str] = set()
        supported = {
            "create_workflow",
            "list_workflows",
            "run_workflow",
            "retry_workflow_node",
        }
        for message in messages:
            if message.role == "assistant":
                for call in message.tool_calls:
                    if call.name in supported:
                        workflow_calls[call.id] = call.name
                continue
            if (
                message.role != "tool"
                or message.tool_call_id not in workflow_calls
                or not message.content
            ):
                continue
            for snapshot in _snapshots_from_tool_message(message.content):
                try:
                    graph = _graph_from_snapshot(context, snapshot)
                except (TypeError, ValueError):
                    continue
                current = self._graphs.get(graph.graph_id)
                if current is None or graph.version >= current.version:
                    self._graphs[graph.graph_id] = graph
                restored.add(graph.graph_id)
        return len(restored)

    def restore_durable(
        self,
        context: ToolContext,
    ) -> int:
        if self._durable_restored:
            return 0
        restored = 0
        for snapshot in self._durable_snapshots:
            try:
                graph = _graph_from_snapshot(context, snapshot)
            except (TypeError, ValueError):
                continue
            current = self._graphs.get(graph.graph_id)
            if current is None or graph.version >= current.version:
                self._graphs[graph.graph_id] = graph
                restored += 1
        self._durable_restored = True
        return restored

    async def create(
        self,
        context: ToolContext,
        *,
        label: str,
        raw_nodes: list[dict[str, Any]],
        raw_quota: dict[str, Any] | None = None,
    ) -> ToolResult:
        self.restore_durable(context)
        if self._created_graphs >= _MAX_GRAPHS:
            return ToolResult(
                f"当前 Run 最多创建 {_MAX_GRAPHS} 个显式工作流",
                is_error=True,
                metadata={"failureKind": "workflow_limit_exceeded"},
            )
        try:
            nodes = _parse_nodes(context, raw_nodes)
            _validate_dependencies(nodes)
            quota = _parse_quota(raw_quota)
        except (TypeError, ValueError) as error:
            return ToolResult(
                str(error),
                is_error=True,
                metadata={"failureKind": "invalid_workflow"},
            )
        graph = WorkflowGraph(
            graph_id=f"workflow_{uuid.uuid4().hex}",
            label=label,
            owner_agent_id=context.agent_id or "supervisor",
            nodes=nodes,
            quota=quota,
        )
        for node in graph.nodes.values():
            node.ready_since = graph.created_at
        self._graphs[graph.graph_id] = graph
        self._created_graphs += 1
        await self._checkpoint(context, graph, "created")
        return ToolResult(
            json.dumps(self._snapshot(graph), ensure_ascii=False),
            metadata={
                "workflowId": graph.graph_id,
                "workflowStatus": "pending",
                "workflowNodeCount": len(graph.nodes),
            },
        )

    def list_workflows(self, context: ToolContext) -> ToolResult:
        self.restore_durable(context)
        graphs = [
            self._snapshot(graph)
            for graph in self._graphs.values()
            if self._can_manage(context, graph)
        ]
        return ToolResult(json.dumps(graphs, ensure_ascii=False))

    async def run(
        self,
        context: ToolContext,
        graph_id: str,
        *,
        max_waves: int,
        max_parallel: int,
    ) -> ToolResult:
        self.restore_durable(context)
        graph = self._managed_graph(context, graph_id)
        if graph is None:
            return ToolResult(
                "未找到当前 Agent 可管理的显式工作流",
                is_error=True,
                metadata={"failureKind": "workflow_not_found"},
            )
        waves = 0
        while waves < max_waves:
            quota_failure = self._quota_failure(graph)
            if quota_failure:
                graph.quota_exhausted = True
                await self._checkpoint(context, graph, "quota_exhausted")
                snapshot = self._snapshot(graph)
                return ToolResult(
                    json.dumps(snapshot, ensure_ascii=False),
                    is_error=True,
                    metadata={
                        "workflowId": graph.graph_id,
                        "workflowStatus": snapshot["status"],
                        "failureKind": "workflow_quota_exhausted",
                        "quotaDimension": quota_failure,
                        "retryable": False,
                        "toolExecutionState": "not_started",
                    },
                )
            self._mark_dependency_blocks(graph)
            ready = self._ready_nodes(graph)
            if not ready:
                break
            batch = _non_conflicting_batch(ready, max_parallel)
            if not batch:
                break
            waves += 1
            graph.quota.used_waves += 1
            executable: list[WorkflowNode] = []
            for node in batch:
                if node.deadline is not None and datetime.now(timezone.utc) >= node.deadline:
                    node.status = "failed"
                    node.failure_kind = "deadline_exceeded"
                    node.error = "节点 deadline 已过期"
                    node.effect_state = "not_started"
                    continue
                graph.scheduler_sequence += 1
                node.status = "running"
                node.attempts += 1
                node.dispatch_count += 1
                node.dispatch_sequence = graph.scheduler_sequence
                node.effect_id = (
                    f"workflow_effect:{graph.graph_id}:{node.node_id}:"
                    f"{node.attempts}"
                )
                node.effect_state = "prepared"
                graph.quota.used_attempts += 1
                executable.append(node)
            await self._checkpoint(context, graph, "wave_started")
            await asyncio.gather(*(
                self._execute_node(context, graph, node)
                for node in executable
            ))
            await self._checkpoint(context, graph, "wave_completed")

        self._mark_dependency_blocks(graph)
        snapshot = self._snapshot(graph)
        return ToolResult(
            json.dumps(snapshot, ensure_ascii=False),
            metadata={
                "workflowId": graph.graph_id,
                "workflowStatus": snapshot["status"],
                "workflowWaves": waves,
                "readyNodeCount": sum(
                    node.status == "pending"
                    and self._dependencies_completed(graph, node)
                    for node in graph.nodes.values()
                ),
            },
        )

    async def retry_node(
        self,
        context: ToolContext,
        graph_id: str,
        node_id: str,
    ) -> ToolResult:
        self.restore_durable(context)
        graph = self._managed_graph(context, graph_id)
        node = graph.nodes.get(node_id) if graph is not None else None
        if graph is None or node is None:
            return ToolResult(
                "未找到工作流节点",
                is_error=True,
                metadata={"failureKind": "workflow_node_not_found"},
            )
        if node.status not in {"failed", "blocked"}:
            return ToolResult(
                "只有 failed 或 blocked 节点可以重新排队",
                is_error=True,
                metadata={"failureKind": "workflow_node_not_retryable"},
            )
        node.status = "pending"
        node.attempts = 0
        node.error = ""
        node.failure_kind = ""
        node.effect_id = ""
        node.effect_state = "not_started"
        node.ready_since = datetime.now(timezone.utc)
        graph.quota_exhausted = False
        self._reset_dependency_blocks(graph)
        await self._checkpoint(context, graph, "node_requeued")
        return ToolResult(
            json.dumps(self._snapshot(graph), ensure_ascii=False),
            metadata={
                "workflowId": graph.graph_id,
                "workflowNodeId": node.node_id,
                "workflowNodeStatus": node.status,
            },
        )

    async def _execute_node(
        self,
        context: ToolContext,
        graph: WorkflowGraph,
        node: WorkflowNode,
    ) -> None:
        started = time.perf_counter()
        prompt = node.prompt
        if node.evidence_refs:
            prompt += "\n\n已有 Evidence/Artifact 引用：\n- " + "\n- ".join(
                node.evidence_refs
            )
        node_context = replace(
            context,
            workflow_id=graph.graph_id,
            workflow_node_id=node.node_id,
            # Each dispatch attempt gets its own writer identity.  Child tools
            # still re-enter this attempt's declared lease, while a recovered
            # attempt cannot accidentally reuse a stale worker's fencing token.
            write_owner_id=node.effect_id,
        )
        result = await self._runtime.run(
            node_context,
            description=node.title,
            prompt=prompt,
            write_scopes=node.declared_scope_values,
        )
        node.agent_id = str(result.metadata.get("agentId") or "")
        node.session_id = str(result.metadata.get("sessionId") or "")
        elapsed_ms = max(1, round((time.perf_counter() - started) * 1000))
        node.duration_ms += elapsed_ms
        graph.quota.used_runtime_ms += elapsed_ms
        if not result.is_error:
            node.status = "completed"
            node.result = result.content
            node.error = ""
            node.failure_kind = ""
            node.effect_state = "committed"
            return
        node.error = result.content
        node.failure_kind = str(
            result.metadata.get("failureKind") or "agent_failed"
        )
        safe_retry = (
            node.retry_mode == "safe"
            and result.metadata.get("retryable") is True
            and result.metadata.get("toolExecutionState")
            in {"not_started", "completed"}
            and node.attempts < node.max_attempts
        )
        node.status = "pending" if safe_retry else "failed"
        node.effect_state = str(
            result.metadata.get("toolExecutionState") or "unknown"
        )
        if safe_retry:
            node.ready_since = datetime.now(timezone.utc)

    def _ready_nodes(self, graph: WorkflowGraph) -> list[WorkflowNode]:
        return sorted(
            (
                node
                for node in graph.nodes.values()
                if node.status == "pending"
                and self._dependencies_completed(graph, node)
            ),
            key=lambda node: (
                node.dispatch_count,
                -node.priority,
                (
                    node.deadline.timestamp()
                    if node.deadline is not None
                    else float("inf")
                ),
                (
                    node.ready_since.timestamp()
                    if node.ready_since is not None
                    else 0
                ),
                node.node_id,
            ),
        )

    @staticmethod
    def _quota_failure(graph: WorkflowGraph) -> str:
        if graph.quota.used_waves >= graph.quota.max_waves:
            return "waves"
        if graph.quota.used_attempts >= graph.quota.max_total_attempts:
            return "attempts"
        if graph.quota.used_runtime_ms >= graph.quota.max_runtime_ms:
            return "runtime"
        return ""

    @staticmethod
    def _dependencies_completed(
        graph: WorkflowGraph,
        node: WorkflowNode,
    ) -> bool:
        return all(
            graph.nodes[dependency].status == "completed"
            for dependency in node.depends_on
        )

    @staticmethod
    def _mark_dependency_blocks(graph: WorkflowGraph) -> None:
        changed = True
        while changed:
            changed = False
            for node in graph.nodes.values():
                if node.status != "pending":
                    continue
                if any(
                    graph.nodes[dependency].status in {"failed", "blocked"}
                    for dependency in node.depends_on
                ):
                    node.status = "blocked"
                    node.failure_kind = "dependency_failed"
                    node.error = "依赖节点未完成"
                    changed = True

    @staticmethod
    def _reset_dependency_blocks(graph: WorkflowGraph) -> None:
        for node in graph.nodes.values():
            if node.status == "blocked" and node.failure_kind == "dependency_failed":
                node.status = "pending"
                node.error = ""
                node.failure_kind = ""

    async def _checkpoint(
        self,
        context: ToolContext,
        graph: WorkflowGraph,
        reason: str,
    ) -> None:
        graph.version += 1
        graph.updated_at = datetime.now(timezone.utc)
        snapshot = self._snapshot(graph)
        if context.emit_event is None:
            return
        await context.emit_event(RunEvent(
            type="progress_message",
            item_id=f"{graph.graph_id}:checkpoint:{graph.version}",
            title=f"工作流：{graph.label}",
            delta=f"显式 DAG 已更新：{reason}",
            metadata={
                "category": "workflow_checkpoint",
                "workflow": snapshot,
                "checkpointReason": reason,
                "checkpointVersion": graph.version,
            },
        ))

    def _managed_graph(
        self,
        context: ToolContext,
        graph_id: str,
    ) -> WorkflowGraph | None:
        graph = self._graphs.get(graph_id)
        return graph if graph is not None and self._can_manage(context, graph) else None

    @staticmethod
    def _can_manage(context: ToolContext, graph: WorkflowGraph) -> bool:
        return context.agent_id == "supervisor" or (
            graph.owner_agent_id == context.agent_id
        )

    @staticmethod
    def _snapshot(graph: WorkflowGraph) -> dict[str, Any]:
        statuses = {node.status for node in graph.nodes.values()}
        if graph.quota_exhausted:
            status = "paused"
        elif statuses == {"completed"}:
            status = "completed"
        elif "running" in statuses:
            status = "running"
        elif statuses & {"failed", "blocked"}:
            status = "failed"
        else:
            status = "pending"
        return {
            "workflowId": graph.graph_id,
            "label": graph.label,
            "ownerAgentId": graph.owner_agent_id,
            "status": status,
            "version": graph.version,
            "createdAt": graph.created_at.isoformat(),
            "updatedAt": graph.updated_at.isoformat(),
            "schedulerSequence": graph.scheduler_sequence,
            "quota": {
                "maxWaves": graph.quota.max_waves,
                "maxTotalAttempts": graph.quota.max_total_attempts,
                "maxRuntimeMs": graph.quota.max_runtime_ms,
                "usedWaves": graph.quota.used_waves,
                "usedAttempts": graph.quota.used_attempts,
                "usedRuntimeMs": graph.quota.used_runtime_ms,
            },
            "nodes": [
                {
                    "nodeId": node.node_id,
                    "title": node.title,
                    "prompt": node.prompt,
                    "dependsOn": list(node.depends_on),
                    "priority": node.priority,
                    "deadline": (
                        node.deadline.isoformat() if node.deadline is not None else None
                    ),
                    "retryPolicy": {
                        "mode": node.retry_mode,
                        "maxAttempts": node.max_attempts,
                    },
                    "writeScopes": [scope.metadata() for scope in node.write_scopes],
                    "declaredWriteScopes": list(node.declared_scope_values),
                    "evidenceRefs": list(node.evidence_refs),
                    "status": node.status,
                    "attempts": node.attempts,
                    "result": node.result or None,
                    "error": node.error or None,
                    "failureKind": node.failure_kind or None,
                    "agentId": node.agent_id or None,
                    "sessionId": node.session_id or None,
                    "effectId": node.effect_id or None,
                    "effectState": node.effect_state,
                    "dispatchCount": node.dispatch_count,
                    "dispatchSequence": node.dispatch_sequence,
                    "readySince": (
                        node.ready_since.isoformat()
                        if node.ready_since is not None
                        else None
                    ),
                    "durationMs": node.duration_ms,
                }
                for node in graph.nodes.values()
            ],
        }


def create_workflow_tool(manager: WorkflowManager):
    async def execute(context: ToolContext, data: ToolInput) -> ToolResult:
        return await manager.create(
            context,
            label=str(data["label"]).strip(),
            raw_nodes=[dict(node) for node in data["nodes"]],
            raw_quota=(
                dict(data["quota"])
                if isinstance(data.get("quota"), dict)
                else None
            ),
        )

    return function_tool(
        name="create_workflow",
        description=(
            "为复杂长期任务创建可选的显式 DAG。节点包含依赖、优先级、deadline、"
            "安全重试策略、写入范围和 Evidence/Artifact 引用；简单任务继续直接委派。"
        ),
        input_schema={
            "type": "object",
            "properties": {
                "label": {"type": "string", "minLength": 1, "maxLength": 120},
                "nodes": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": _MAX_NODES,
                    "items": {"type": "object"},
                },
                "quota": {
                    "type": "object",
                    "description": "跨回合累计的长期工作流配额。",
                    "properties": {
                        "maxWaves": {
                            "type": "integer", "minimum": 1, "maximum": 10000
                        },
                        "maxTotalAttempts": {
                            "type": "integer", "minimum": 1, "maximum": 100000
                        },
                        "maxRuntimeMs": {
                            "type": "integer",
                            "minimum": 1000,
                            "maximum": 2592000000,
                        },
                    },
                    "additionalProperties": False,
                },
            },
            "required": ["label", "nodes"],
            "additionalProperties": False,
        },
        execute=execute,
        category=ToolCategory.OTHER,
        read_only=True,
        retry_safe=False,
        concurrency_safe=False,
        validate=_validate_create_input,
        title=lambda data: f"创建工作流：{str(data.get('label') or '').strip()}",
    )


def create_list_workflows_tool(manager: WorkflowManager):
    return function_tool(
        name="list_workflows",
        description="列出当前 Agent 可管理的显式 DAG、节点状态和结果。",
        input_schema={"type": "object", "properties": {}, "additionalProperties": False},
        execute=lambda context, _data: manager.list_workflows(context),
        category=ToolCategory.OTHER,
        read_only=True,
        concurrency_safe=True,
        title=lambda _data: "查看显式工作流",
    )


def create_run_workflow_tool(manager: WorkflowManager):
    async def execute(context: ToolContext, data: ToolInput) -> ToolResult:
        return await manager.run(
            context,
            str(data["workflowId"]).strip(),
            max_waves=int(data.get("maxWaves") or 8),
            max_parallel=int(data.get("maxParallel") or 10),
        )

    return function_tool(
        name="run_workflow",
        description=(
            "调度显式 DAG 的 ready 节点。无依赖且写入范围不冲突的节点并行执行；"
            "依赖完成后进入下一 wave，失败依赖会阻塞后继节点。"
        ),
        input_schema={
            "type": "object",
            "properties": {
                "workflowId": {"type": "string", "minLength": 1},
                "maxWaves": {"type": "integer", "minimum": 1, "maximum": 64},
                "maxParallel": {"type": "integer", "minimum": 1, "maximum": 32},
            },
            "required": ["workflowId"],
            "additionalProperties": False,
        },
        execute=execute,
        category=ToolCategory.OTHER,
        read_only=True,
        retry_safe=False,
        concurrency_safe=False,
        title=lambda _data: "运行显式工作流",
    )


def create_retry_workflow_node_tool(manager: WorkflowManager):
    async def execute(context: ToolContext, data: ToolInput) -> ToolResult:
        return await manager.retry_node(
            context,
            str(data["workflowId"]).strip(),
            str(data["nodeId"]).strip(),
        )

    return function_tool(
        name="retry_workflow_node",
        description=(
            "在核对已有副作用或冲突已经解除后，将 failed/blocked DAG 节点显式重新排队。"
        ),
        input_schema={
            "type": "object",
            "properties": {
                "workflowId": {"type": "string", "minLength": 1},
                "nodeId": {"type": "string", "minLength": 1},
            },
            "required": ["workflowId", "nodeId"],
            "additionalProperties": False,
        },
        execute=execute,
        category=ToolCategory.OTHER,
        read_only=True,
        retry_safe=False,
        concurrency_safe=False,
        title=lambda _data: "重新排队工作流节点",
    )


def _parse_nodes(
    context: ToolContext,
    raw_nodes: list[dict[str, Any]],
) -> dict[str, WorkflowNode]:
    if not raw_nodes or len(raw_nodes) > _MAX_NODES:
        raise ValueError(f"显式工作流必须包含 1-{_MAX_NODES} 个节点")
    nodes: dict[str, WorkflowNode] = {}
    for raw in raw_nodes:
        node_id = str(raw.get("id") or "").strip()
        title = str(raw.get("title") or "").strip()
        prompt = str(raw.get("prompt") or "").strip()
        if not _NODE_ID.fullmatch(node_id):
            raise ValueError(f"工作流节点 id 无效：{node_id}")
        if node_id in nodes:
            raise ValueError(f"工作流节点 id 重复：{node_id}")
        if not title or not prompt:
            raise ValueError(f"工作流节点 {node_id} 缺少 title 或 prompt")
        depends_on = tuple(dict.fromkeys(
            str(value).strip() for value in raw.get("dependsOn", [])
            if str(value).strip()
        ))
        scope_values = tuple(
            str(value).strip() for value in raw.get("writeScopes", [])
            if str(value).strip()
        )
        retry = raw.get("retryPolicy") or {}
        if not isinstance(retry, dict):
            raise TypeError(f"工作流节点 {node_id} retryPolicy 必须是对象")
        retry_mode = str(retry.get("mode") or "never")
        if retry_mode not in {"never", "safe"}:
            raise ValueError(f"工作流节点 {node_id} retryPolicy.mode 无效")
        max_attempts = int(retry.get("maxAttempts") or 1)
        if not 1 <= max_attempts <= 10:
            raise ValueError(f"工作流节点 {node_id} maxAttempts 必须为 1-10")
        nodes[node_id] = WorkflowNode(
            node_id=node_id,
            title=title[:120],
            prompt=prompt[:20_000],
            depends_on=depends_on,
            priority=max(-100, min(100, int(raw.get("priority") or 0))),
            deadline=_parse_deadline(raw.get("deadline"), node_id),
            max_attempts=max_attempts,
            retry_mode=retry_mode,
            declared_scope_values=scope_values,
            write_scopes=declared_write_scopes(
                context.workspace_path,
                scope_values,
            ),
            evidence_refs=tuple(
                str(value).strip()[:1000]
                for value in raw.get("evidenceRefs", [])
                if str(value).strip()
            )[:50],
        )
    return nodes


def _validate_dependencies(nodes: dict[str, WorkflowNode]) -> None:
    for node in nodes.values():
        missing = set(node.depends_on) - set(nodes)
        if missing:
            raise ValueError(
                f"工作流节点 {node.node_id} 引用了不存在的依赖："
                + ", ".join(sorted(missing))
            )
        if node.node_id in node.depends_on:
            raise ValueError(f"工作流节点 {node.node_id} 不能依赖自身")
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(node_id: str) -> None:
        if node_id in visiting:
            raise ValueError("显式工作流不能包含依赖环")
        if node_id in visited:
            return
        visiting.add(node_id)
        for dependency in nodes[node_id].depends_on:
            visit(dependency)
        visiting.remove(node_id)
        visited.add(node_id)

    for node_id in nodes:
        visit(node_id)


def _non_conflicting_batch(
    ready: list[WorkflowNode],
    max_parallel: int,
) -> list[WorkflowNode]:
    selected: list[WorkflowNode] = []
    for node in ready:
        if len(selected) >= max_parallel:
            break
        if any(
            write_scope_sets_overlap(node.write_scopes, other.write_scopes)
            for other in selected
        ):
            continue
        selected.append(node)
    return selected


def _parse_deadline(value: Any, node_id: str) -> datetime | None:
    if value in {None, ""}:
        return None
    if not isinstance(value, str):
        raise TypeError(f"工作流节点 {node_id} deadline 必须是 ISO-8601 字符串")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError(f"工作流节点 {node_id} deadline 格式无效") from error
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _parse_quota(value: dict[str, Any] | None) -> WorkflowQuota:
    raw = value or {}
    max_waves = int(raw.get("maxWaves") or 256)
    max_attempts = int(raw.get("maxTotalAttempts") or 1024)
    max_runtime = int(raw.get("maxRuntimeMs") or 7 * 24 * 60 * 60 * 1000)
    if not 1 <= max_waves <= 10_000:
        raise ValueError("工作流 quota.maxWaves 必须为 1-10000")
    if not 1 <= max_attempts <= 100_000:
        raise ValueError("工作流 quota.maxTotalAttempts 必须为 1-100000")
    if not 1_000 <= max_runtime <= 2_592_000_000:
        raise ValueError("工作流 quota.maxRuntimeMs 必须为 1000-2592000000")
    return WorkflowQuota(
        max_waves=max_waves,
        max_total_attempts=max_attempts,
        max_runtime_ms=max_runtime,
    )


def _validate_create_input(data: ToolInput) -> str | None:
    if not isinstance(data.get("label"), str) or not str(data["label"]).strip():
        return "label 必须是非空字符串"
    nodes = data.get("nodes")
    if not isinstance(nodes, list) or not nodes:
        return "nodes 必须是非空数组"
    if any(not isinstance(node, dict) for node in nodes):
        return "nodes 中的每一项都必须是对象"
    return None


def _snapshots_from_tool_message(content: str) -> list[dict[str, Any]]:
    try:
        outer = json.loads(content)
        inner_content = outer.get("content") if isinstance(outer, dict) else None
        inner = json.loads(inner_content) if isinstance(inner_content, str) else None
    except (json.JSONDecodeError, TypeError):
        return []
    candidates = inner if isinstance(inner, list) else [inner]
    return [
        candidate
        for candidate in candidates
        if isinstance(candidate, dict) and candidate.get("workflowId")
    ]


def _graph_from_snapshot(
    context: ToolContext,
    snapshot: dict[str, Any],
) -> WorkflowGraph:
    graph_id = str(snapshot.get("workflowId") or "").strip()
    label = str(snapshot.get("label") or "").strip()
    raw_nodes = snapshot.get("nodes")
    if not graph_id or not label or not isinstance(raw_nodes, list):
        raise ValueError("工作流快照无效")
    nodes: dict[str, WorkflowNode] = {}
    for raw in raw_nodes:
        if not isinstance(raw, dict):
            raise TypeError("工作流节点快照无效")
        node_id = str(raw.get("nodeId") or "").strip()
        title = str(raw.get("title") or "").strip()
        if not _NODE_ID.fullmatch(node_id) or not title:
            raise ValueError("工作流节点快照无效")
        retry = raw.get("retryPolicy") or {}
        if not isinstance(retry, dict):
            raise TypeError("工作流重试快照无效")
        declared_scope_values = _declared_scopes_from_snapshot(raw)
        status = str(raw.get("status") or "pending")
        if status not in {"pending", "running", "completed", "failed", "blocked"}:
            status = "failed"
        prompt = str(raw.get("prompt") or "").strip()
        failure_kind = str(raw.get("failureKind") or "")
        error = str(raw.get("error") or "")
        effect_state = str(raw.get("effectState") or "not_started")
        recovery_state = str(raw.get("recoveryState") or "")
        if status in {"pending", "running"} and not prompt:
            status = "failed"
            failure_kind = "workflow_restore_incomplete"
            error = "历史工作流快照缺少节点 prompt，无法安全恢复执行"
        elif status == "running":
            if recovery_state == "completed":
                status = "completed"
                effect_state = "committed"
            elif recovery_state == "safe_to_retry":
                status = "pending"
                effect_state = "not_started"
                failure_kind = ""
                error = ""
            else:
                status = "failed"
                effect_state = "unknown"
                failure_kind = "workflow_recovery_requires_verification"
                error = (
                    "节点在上次进程退出时仍在运行，已有副作用状态无法确认；"
                    "请核验后显式重新排队"
                )
        nodes[node_id] = WorkflowNode(
            node_id=node_id,
            title=title,
            prompt=prompt,
            depends_on=tuple(
                str(value).strip()
                for value in raw.get("dependsOn", [])
                if str(value).strip()
            ),
            priority=max(-100, min(100, int(raw.get("priority") or 0))),
            deadline=_parse_deadline(raw.get("deadline"), node_id),
            max_attempts=max(1, min(10, int(retry.get("maxAttempts") or 1))),
            retry_mode=(
                str(retry.get("mode"))
                if retry.get("mode") in {"never", "safe"}
                else "never"
            ),
            declared_scope_values=declared_scope_values,
            write_scopes=declared_write_scopes(
                context.workspace_path,
                declared_scope_values,
            ),
            evidence_refs=tuple(
                str(value).strip()
                for value in raw.get("evidenceRefs", [])
                if str(value).strip()
            ),
            status=status,
            attempts=max(0, int(raw.get("attempts") or 0)),
            result=str(raw.get("result") or ""),
            error=error,
            failure_kind=failure_kind,
            agent_id=str(raw.get("agentId") or ""),
            session_id=str(raw.get("sessionId") or ""),
            effect_id=str(raw.get("effectId") or ""),
            effect_state=effect_state,
            dispatch_count=max(0, int(raw.get("dispatchCount") or 0)),
            dispatch_sequence=max(0, int(raw.get("dispatchSequence") or 0)),
            ready_since=_parse_optional_datetime(raw.get("readySince")),
            duration_ms=max(0, int(raw.get("durationMs") or 0)),
        )
    _validate_dependencies(nodes)
    raw_quota = snapshot.get("quota")
    quota_value = raw_quota if isinstance(raw_quota, dict) else {}
    quota = _parse_quota(quota_value)
    quota.used_waves = max(0, int(quota_value.get("usedWaves") or 0))
    quota.used_attempts = max(0, int(quota_value.get("usedAttempts") or 0))
    quota.used_runtime_ms = max(0, int(quota_value.get("usedRuntimeMs") or 0))
    return WorkflowGraph(
        graph_id=graph_id,
        label=label,
        owner_agent_id=str(snapshot.get("ownerAgentId") or "supervisor"),
        nodes=nodes,
        version=max(0, int(snapshot.get("version") or 0)),
        scheduler_sequence=max(0, int(snapshot.get("schedulerSequence") or 0)),
        created_at=(
            _parse_optional_datetime(snapshot.get("createdAt"))
            or datetime.now(timezone.utc)
        ),
        updated_at=(
            _parse_optional_datetime(snapshot.get("updatedAt"))
            or datetime.now(timezone.utc)
        ),
        quota=quota,
        quota_exhausted=snapshot.get("status") == "paused",
    )


def _declared_scopes_from_snapshot(raw: dict[str, Any]) -> tuple[str, ...]:
    declared = raw.get("declaredWriteScopes")
    if isinstance(declared, list):
        return tuple(
            str(value).strip() for value in declared if str(value).strip()
        )
    scopes = raw.get("writeScopes")
    if not isinstance(scopes, list):
        return ()
    values: list[str] = []
    for scope in scopes:
        if not isinstance(scope, dict) or not scope.get("path"):
            continue
        value = str(scope["path"])
        if scope.get("recursive") is True:
            value += "/**"
        values.append(value)
    return tuple(values)


def _parse_optional_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)
