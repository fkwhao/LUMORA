import asyncio
import json
from pathlib import Path

from app.dto.request.chat_completion_request import ChatMessageRequest
from app.subagent.workflow import WorkflowManager
from app.tool.base import ToolContext, ToolResult


class _Runtime:
    def __init__(self) -> None:
        self.active = 0
        self.max_active = 0
        self.started: list[str] = []

    async def run(
        self,
        _context,
        *,
        description: str,
        prompt: str,
        write_scopes=(),
    ) -> ToolResult:
        self.active += 1
        self.max_active = max(self.max_active, self.active)
        self.started.append(description)
        await asyncio.sleep(0.01)
        self.active -= 1
        return ToolResult(
            f"completed: {prompt}",
            metadata={
                "agentId": f"agent-{description}",
                "sessionId": f"session-{description}",
            },
        )


def test_workflow_runs_ready_nodes_in_dependency_waves(tmp_path: Path) -> None:
    async def scenario():
        runtime = _Runtime()
        manager = WorkflowManager(runtime)  # type: ignore[arg-type]
        context = ToolContext(
            workspace_path=tmp_path.resolve(),
            session_id="root",
            agent_id="supervisor",
        )
        created = await manager.create(
            context,
            label="build",
            raw_nodes=[
                {
                    "id": "api",
                    "title": "API",
                    "prompt": "implement api",
                    "writeScopes": ["api/**"],
                },
                {
                    "id": "ui",
                    "title": "UI",
                    "prompt": "implement ui",
                    "writeScopes": ["ui/**"],
                },
                {
                    "id": "verify",
                    "title": "Verify",
                    "prompt": "verify",
                    "dependsOn": ["api", "ui"],
                },
            ],
        )
        graph_id = json.loads(created.content)["workflowId"]
        result = await manager.run(
            context,
            graph_id,
            max_waves=8,
            max_parallel=10,
        )
        return runtime, json.loads(result.content), result.metadata

    runtime, snapshot, metadata = asyncio.run(scenario())
    assert runtime.max_active == 2
    assert runtime.started[:2] == ["API", "UI"]
    assert runtime.started[2] == "Verify"
    assert snapshot["status"] == "completed"
    assert metadata["workflowWaves"] == 2
    assert all(node["status"] == "completed" for node in snapshot["nodes"])


def test_workflow_serializes_overlapping_ready_write_scopes(tmp_path: Path) -> None:
    async def scenario():
        runtime = _Runtime()
        manager = WorkflowManager(runtime)  # type: ignore[arg-type]
        context = ToolContext(
            workspace_path=tmp_path.resolve(),
            session_id="root",
            agent_id="supervisor",
        )
        created = await manager.create(
            context,
            label="writers",
            raw_nodes=[
                {
                    "id": "first",
                    "title": "First",
                    "prompt": "first",
                    "writeScopes": ["src/**"],
                    "priority": 10,
                },
                {
                    "id": "second",
                    "title": "Second",
                    "prompt": "second",
                    "writeScopes": ["src/file.py"],
                },
            ],
        )
        graph_id = json.loads(created.content)["workflowId"]
        result = await manager.run(
            context,
            graph_id,
            max_waves=8,
            max_parallel=10,
        )
        return runtime, json.loads(result.content), result.metadata

    runtime, snapshot, metadata = asyncio.run(scenario())
    assert runtime.max_active == 1
    assert runtime.started == ["First", "Second"]
    assert snapshot["status"] == "completed"
    assert metadata["workflowWaves"] == 2


def test_workflow_uses_earlier_deadline_within_same_priority(
    tmp_path: Path,
) -> None:
    async def scenario():
        runtime = _Runtime()
        manager = WorkflowManager(runtime)  # type: ignore[arg-type]
        context = ToolContext(
            workspace_path=tmp_path.resolve(),
            session_id="root",
            agent_id="supervisor",
        )
        created = await manager.create(
            context,
            label="deadlines",
            raw_nodes=[
                {
                    "id": "later",
                    "title": "Later",
                    "prompt": "later",
                    "deadline": "2100-01-01T00:00:00Z",
                },
                {
                    "id": "earlier",
                    "title": "Earlier",
                    "prompt": "earlier",
                    "deadline": "2099-01-01T00:00:00Z",
                },
            ],
        )
        await manager.run(
            context,
            json.loads(created.content)["workflowId"],
            max_waves=8,
            max_parallel=1,
        )
        return runtime.started

    assert asyncio.run(scenario()) == ["Earlier", "Later"]


def test_workflow_rejects_dependency_cycle(tmp_path: Path) -> None:
    async def scenario():
        manager = WorkflowManager(_Runtime())  # type: ignore[arg-type]
        return await manager.create(
            ToolContext(workspace_path=tmp_path.resolve()),
            label="cycle",
            raw_nodes=[
                {"id": "a", "title": "A", "prompt": "a", "dependsOn": ["b"]},
                {"id": "b", "title": "B", "prompt": "b", "dependsOn": ["a"]},
            ],
        )

    result = asyncio.run(scenario())
    assert result.is_error is True
    assert result.metadata["failureKind"] == "invalid_workflow"
    assert "依赖环" in result.content


def test_workflow_restores_latest_snapshot_from_tool_messages(
    tmp_path: Path,
) -> None:
    async def scenario():
        context = ToolContext(
            workspace_path=tmp_path.resolve(),
            session_id="root",
            agent_id="supervisor",
        )
        original = WorkflowManager(_Runtime())  # type: ignore[arg-type]
        created = await original.create(
            context,
            label="durable",
            raw_nodes=[{
                "id": "implement",
                "title": "Implement",
                "prompt": "implement durable workflow",
                "writeScopes": ["src/**"],
            }],
        )
        messages = [
            ChatMessageRequest(
                role="assistant",
                toolCalls=[{
                    "id": "call-create",
                    "name": "create_workflow",
                    "arguments": "{}",
                }],
            ),
            ChatMessageRequest(
                role="tool",
                toolCallId="call-create",
                content=json.dumps({"ok": True, "content": created.content}),
            ),
        ]
        runtime = _Runtime()
        restored = WorkflowManager(runtime)  # type: ignore[arg-type]
        restored_count = restored.restore_from_messages(messages, context)
        graph_id = json.loads(created.content)["workflowId"]
        result = await restored.run(
            context,
            graph_id,
            max_waves=8,
            max_parallel=10,
        )
        return restored_count, runtime, json.loads(result.content)

    restored_count, runtime, snapshot = asyncio.run(scenario())
    assert restored_count == 1
    assert runtime.started == ["Implement"]
    assert snapshot["status"] == "completed"
    assert snapshot["nodes"][0]["prompt"] == "implement durable workflow"


def test_workflow_safe_retry_requires_known_uncommitted_state(
    tmp_path: Path,
) -> None:
    class RetryRuntime(_Runtime):
        async def run(self, *args, **kwargs) -> ToolResult:
            if not self.started:
                self.started.append(str(kwargs["description"]))
                return ToolResult(
                    "capacity busy",
                    is_error=True,
                    metadata={
                        "failureKind": "agent_concurrency_limit",
                        "retryable": True,
                        "toolExecutionState": "not_started",
                    },
                )
            return await super().run(*args, **kwargs)

    async def scenario():
        runtime = RetryRuntime()
        manager = WorkflowManager(runtime)  # type: ignore[arg-type]
        context = ToolContext(
            workspace_path=tmp_path.resolve(),
            session_id="root",
            agent_id="supervisor",
        )
        created = await manager.create(
            context,
            label="retry",
            raw_nodes=[{
                "id": "node",
                "title": "Node",
                "prompt": "retry safely",
                "retryPolicy": {"mode": "safe", "maxAttempts": 2},
            }],
        )
        result = await manager.run(
            context,
            json.loads(created.content)["workflowId"],
            max_waves=8,
            max_parallel=10,
        )
        return runtime, json.loads(result.content), result.metadata

    runtime, snapshot, metadata = asyncio.run(scenario())
    assert runtime.started == ["Node", "Node"]
    assert snapshot["status"] == "completed"
    assert snapshot["nodes"][0]["attempts"] == 2
    assert metadata["workflowWaves"] == 2


def test_durable_snapshot_only_retries_nodes_without_observed_effects(
    tmp_path: Path,
) -> None:
    snapshot = {
        "workflowId": "durable-1",
        "label": "recover",
        "ownerAgentId": "supervisor",
        "status": "running",
        "version": 5,
        "quota": {
            "maxWaves": 20,
            "maxTotalAttempts": 20,
            "maxRuntimeMs": 100000,
        },
        "nodes": [
            {
                "nodeId": "safe",
                "title": "Safe",
                "prompt": "retry safe",
                "status": "running",
                "effectState": "prepared",
                "recoveryState": "safe_to_retry",
            },
            {
                "nodeId": "unknown",
                "title": "Unknown",
                "prompt": "verify effects",
                "status": "running",
                "effectState": "started",
                "recoveryState": "requires_verification",
            },
        ],
    }

    async def scenario():
        runtime = _Runtime()
        manager = WorkflowManager(runtime, (snapshot,))  # type: ignore[arg-type]
        context = ToolContext(
            workspace_path=tmp_path.resolve(),
            agent_id="supervisor",
        )
        manager.restore_durable(context)
        result = await manager.run(
            context, "durable-1", max_waves=4, max_parallel=2
        )
        return runtime.started, json.loads(result.content)

    started, restored = asyncio.run(scenario())
    assert started == ["Safe"]
    nodes = {node["nodeId"]: node for node in restored["nodes"]}
    assert nodes["safe"]["status"] == "completed"
    assert nodes["unknown"]["failureKind"] == (
        "workflow_recovery_requires_verification"
    )


def test_long_running_workflow_stops_at_persisted_wave_quota(
    tmp_path: Path,
) -> None:
    async def scenario():
        manager = WorkflowManager(_Runtime())  # type: ignore[arg-type]
        context = ToolContext(
            workspace_path=tmp_path.resolve(),
            agent_id="supervisor",
        )
        created = await manager.create(
            context,
            label="quota",
            raw_quota={"maxWaves": 1},
            raw_nodes=[
                {"id": "first", "title": "First", "prompt": "first"},
                {
                    "id": "second",
                    "title": "Second",
                    "prompt": "second",
                    "dependsOn": ["first"],
                },
            ],
        )
        return await manager.run(
            context,
            json.loads(created.content)["workflowId"],
            max_waves=8,
            max_parallel=1,
        )

    result = asyncio.run(scenario())
    snapshot = json.loads(result.content)
    assert result.is_error is True
    assert result.metadata["failureKind"] == "workflow_quota_exhausted"
    assert result.metadata["quotaDimension"] == "waves"
    assert snapshot["status"] == "paused"
    assert snapshot["quota"]["usedWaves"] == 1


def test_restored_history_does_not_consume_current_run_creation_limit(
    tmp_path: Path,
) -> None:
    snapshots = tuple(
        {
            "workflowId": f"history-{index}",
            "label": f"History {index}",
            "ownerAgentId": "supervisor",
            "status": "completed",
            "version": 1,
            "quota": {},
            "nodes": [{
                "nodeId": "done",
                "title": "Done",
                "prompt": "already complete",
                "status": "completed",
                "effectState": "committed",
                "recoveryState": "completed",
            }],
        }
        for index in range(25)
    )

    async def scenario() -> ToolResult:
        manager = WorkflowManager(  # type: ignore[arg-type]
            _Runtime(), snapshots
        )
        return await manager.create(
            ToolContext(
                workspace_path=tmp_path.resolve(),
                agent_id="supervisor",
            ),
            label="new workflow",
            raw_nodes=[{
                "id": "new",
                "title": "New",
                "prompt": "run in this request",
            }],
        )

    result = asyncio.run(scenario())
    assert result.is_error is False
    assert json.loads(result.content)["label"] == "new workflow"
