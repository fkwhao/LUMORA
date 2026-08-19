import asyncio
import time
import uuid
from dataclasses import replace

from app.dto.request.chat_completion_request import ChatMessageRequest
from app.harness.agent_harness import AgentHarness
from app.harness.run_control import RunControl
from app.harness.run_event import RunEvent, RunUsage
from app.model.model_connection_settings import ModelConnectionSettings
from app.permission.broker import ApprovalBroker
from app.permission.config_store import PermissionConfigStore
from app.permission.engine import PermissionEngine
from app.permission.model import PermissionPolicy
from app.prompt.prompt_builder import PromptBuilder
from app.prompt.prompt_context import PromptContext
from app.skill.catalog import SkillSummary
from app.tool.base import (
    ToolCategory,
    ToolContext,
    ToolInput,
    ToolResult,
    function_tool,
)
from app.tool.registry import ToolRegistry

_MAX_VISIBLE_CHILD_EVENTS = 160
_DEFAULT_MAX_DELEGATION_DEPTH = 3
_DEFAULT_MAX_ACTIVE_AGENTS = 10
_AGENT_LIFECYCLE_EVENT_TYPES = {
    "agent_started",
    "agent_event",
    "agent_completed",
    "agent_failed",
}
_VISIBLE_CHILD_EVENT_TYPES = {
    "progress_message",
    "tool_started",
    "tool_completed",
    "tool_failed",
    "tool_approval_requested",
    "tool_approval_resolved",
    "approval_review_started",
    "approval_review_completed",
    "web_search_started",
    "web_search_progress",
    "web_search_completed",
    "web_search_failed",
    "context_compaction_started",
    "context_compaction_progress",
    "context_compacted",
    "context_compaction_failed",
}


class _SubagentRunControl(RunControl):
    """Mirrors parent cancellation without consuming its steer inbox."""

    def __init__(self, parent: RunControl) -> None:
        self._parent = parent

    @property
    def pause_requested(self) -> bool:
        return self._parent.pause_requested

    async def wait_until_pause_requested(self) -> None:
        await self._parent.wait_until_pause_requested()

    def claim_steers(self):
        return ()

    def close_and_claim_steers(self):
        return ()

    def reopen_steers(self) -> None:
        return None


class SubagentRuntime:
    """Runs full-capability child Agents in isolated message sessions."""

    def __init__(
        self,
        *,
        harness: AgentHarness,
        settings: ModelConnectionSettings,
        reasoning_effort: str | None,
        source_registry: ToolRegistry,
        prompt_builder: PromptBuilder,
        project_instructions: tuple[str, ...],
        permission_engine: PermissionEngine,
        approval_broker: ApprovalBroker,
        permission_config_store: PermissionConfigStore,
        permission_policy: PermissionPolicy,
        run_control: RunControl | None,
        max_delegation_depth: int = _DEFAULT_MAX_DELEGATION_DEPTH,
        max_active_agents: int = _DEFAULT_MAX_ACTIVE_AGENTS,
    ) -> None:
        self._harness = harness
        self._settings = settings
        self._reasoning_effort = reasoning_effort
        self._source_registry = source_registry
        self._prompt_builder = prompt_builder
        self._project_instructions = project_instructions
        self._permission_engine = permission_engine
        self._approval_broker = approval_broker
        self._permission_config_store = permission_config_store
        self._permission_policy = permission_policy
        self._run_control = run_control
        self._max_delegation_depth = max(1, max_delegation_depth)
        self._max_active_agents = max(1, max_active_agents)
        self._allowed_tool_names: tuple[str, ...] | None = None
        self._mcp_tool_names: tuple[str, ...] = ()
        self._available_skills: tuple[SkillSummary, ...] = ()
        self._active_agents = 0
        self._active_agents_lock = asyncio.Lock()

    def bind_allowed_tools(
        self,
        names: tuple[str, ...],
        *,
        mcp_tool_names: tuple[str, ...] = (),
        available_skills: tuple[SkillSummary, ...] = (),
    ) -> None:
        """Bind the exact request-visible tool surface inherited by children."""
        self._allowed_tool_names = tuple(dict.fromkeys(names))
        allowed = set(self._allowed_tool_names)
        self._mcp_tool_names = tuple(
            name for name in mcp_tool_names if name in allowed
        )
        self._available_skills = available_skills

    async def run(
        self,
        context: ToolContext,
        *,
        description: str,
        prompt: str,
    ) -> ToolResult:
        delegation_depth = context.delegation_depth + 1
        if delegation_depth > self._max_delegation_depth:
            return ToolResult(
                f"已达到 Agent 委派深度上限（{self._max_delegation_depth} 层）",
                is_error=True,
                metadata={"failureKind": "delegation_depth_exceeded"},
            )

        agent_id = str(uuid.uuid4())
        parent_run_id = context.correlation_id or context.task_id or "local"
        parent_session_id = context.session_id or parent_run_id
        session_id = f"{parent_session_id}:agent:{agent_id}"
        identity = {
            "agentId": agent_id,
            "sessionId": session_id,
            "parentAgentId": context.agent_id or "supervisor",
            "agentLabel": description,
            "agentRole": "worker",
            "delegationDepth": delegation_depth,
        }
        if not await self._reserve_agent():
            message = f"并行 Agent 已达到上限（{self._max_active_agents} 个）"
            await self._emit(context, RunEvent(
                type="agent_failed",
                item_id=agent_id,
                title=description,
                output=message,
                error_message=message,
                model=self._settings.model,
                metadata={
                    **identity,
                    "agentStatus": "failed",
                    "failureKind": "agent_concurrency_limit",
                },
            ))
            return ToolResult(
                message,
                is_error=True,
                metadata={
                    **identity,
                    "agentStatus": "failed",
                    "failureKind": "agent_concurrency_limit",
                },
            )

        started_at = time.perf_counter()
        answer_parts: list[str] = []
        latest_usage: RunUsage | None = None
        forwarded_events = 0
        child_sequence = 0
        try:
            await self._emit(context, RunEvent(
                type="agent_started",
                item_id=agent_id,
                title=description,
                delta="子 Agent 已开始执行",
                model=self._settings.model,
                metadata={**identity, "agentStatus": "running"},
            ))
            child_registry = self._registry_for_context(context)
            child_prompt = self._build_prompt(context, child_registry)
            child_context = replace(
                context,
                session_id=session_id,
                agent_id=agent_id,
                delegation_depth=delegation_depth,
                emit_event=None,
            )
            messages = [ChatMessageRequest(role="user", content=prompt)]
            stream = self._harness.stream(
                self._settings,
                child_prompt,
                messages,
                self._reasoning_effort,
                child_registry,
                child_context,
                self._permission_policy,
                self._permission_engine,
                self._approval_broker,
                self._permission_config_store,
                lambda _summary: child_prompt,
                None,
                (
                    _SubagentRunControl(self._run_control)
                    if self._run_control is not None
                    else None
                ),
            )
            async for event in stream:
                child_sequence += 1
                if event.type == "text_reset":
                    answer_parts.clear()
                elif event.type == "text_delta":
                    answer_parts.append(event.delta)
                elif event.type == "usage" and event.usage is not None:
                    latest_usage = event.usage
                elif event.type in _AGENT_LIFECYCLE_EVENT_TYPES:
                    await self._emit(context, event)
                elif (
                    event.type in _VISIBLE_CHILD_EVENT_TYPES
                    and forwarded_events < _MAX_VISIBLE_CHILD_EVENTS
                ):
                    forwarded_events += 1
                    await self._emit(context, self._wrap_child_event(
                        event,
                        identity,
                        child_sequence,
                    ))
                elif event.type == "failed":
                    raise RuntimeError(event.error_message or "子 Agent 执行失败")

            answer = "".join(answer_parts).strip() or "子 Agent 未返回文本结果。"
            duration_ms = int((time.perf_counter() - started_at) * 1000)
            await self._emit_usage(context, latest_usage, identity)
            await self._emit(context, RunEvent(
                type="agent_completed",
                item_id=agent_id,
                title=description,
                output=answer,
                duration_ms=duration_ms,
                model=self._settings.model,
                metadata={
                    **identity,
                    "agentStatus": "completed",
                    "visibleEventCount": forwarded_events,
                    **_usage_metadata(latest_usage),
                },
            ))
            return ToolResult(
                answer,
                metadata={
                    **identity,
                    "agentStatus": "completed",
                    "durationMs": duration_ms,
                    **_usage_metadata(latest_usage),
                },
            )
        except asyncio.CancelledError:
            duration_ms = int((time.perf_counter() - started_at) * 1000)
            message = "子 Agent 已取消"
            await self._emit_usage(context, latest_usage, identity)
            await self._emit(context, RunEvent(
                type="agent_failed",
                item_id=agent_id,
                title=description,
                output=message,
                error_message=message,
                duration_ms=duration_ms,
                model=self._settings.model,
                metadata={
                    **identity,
                    "agentStatus": "failed",
                    **_usage_metadata(latest_usage),
                },
            ))
            raise
        except Exception as error:  # noqa: BLE001 - child session boundary
            duration_ms = int((time.perf_counter() - started_at) * 1000)
            message = str(error) or "子 Agent 执行失败"
            await self._emit_usage(context, latest_usage, identity)
            await self._emit(context, RunEvent(
                type="agent_failed",
                item_id=agent_id,
                title=description,
                output=message,
                error_message=message,
                duration_ms=duration_ms,
                model=self._settings.model,
                metadata={
                    **identity,
                    "agentStatus": "failed",
                    **_usage_metadata(latest_usage),
                },
            ))
            return ToolResult(
                message,
                is_error=True,
                metadata={
                    **identity,
                    "agentStatus": "failed",
                    "durationMs": duration_ms,
                    **_usage_metadata(latest_usage),
                },
            )
        finally:
            await self._release_agent()

    def _build_prompt(
        self,
        context: ToolContext,
        registry: ToolRegistry,
    ):
        names = registry.names()
        boundary = (
            "# 子 Agent 执行边界\n"
            "你是由另一个 Agent 启动、拥有独立消息上下文的协作 Agent。只完成用户消息中的"
            "委派任务。你继承父 Agent 在本次请求中实际暴露的工具表，而不是一个按角色写死的"
            "能力清单；只要工具当前可见，就可以在统一权限审批和工作区边界内正常使用，并在"
            "深度允许且确实有收益时继续委派。返回可供父 Agent 直接使用的自包含结果，并明确"
            "完成内容、验证结果、关键文件位置和任何未解决问题。"
        )
        return self._prompt_builder.build(PromptContext(
            workspace_path=(
                str(context.workspace_path) if context.workspace_scoped else None
            ),
            project_instructions=(*self._project_instructions, boundary),
            available_tools=names,
            mcp_tool_names=tuple(
                name for name in self._mcp_tool_names if name in names
            ),
            tool_definitions=registry.model_definitions(names),
            available_skills=self._available_skills,
        ))

    def _registry_for_context(self, context: ToolContext) -> ToolRegistry:
        registered = self._source_registry.names()
        allowed_names = self._allowed_tool_names or registered
        if self._allowed_tool_names is None and not context.workspace_scoped:
            allowed_names = tuple(
                name
                for name in allowed_names
                if self._source_registry.get(name).category
                not in {ToolCategory.FILESYSTEM, ToolCategory.SHELL}
            )
        registry = self._source_registry.select(
            name
            for name in allowed_names
            if name != "delegate_task" and name in registered
        )
        if context.delegation_depth + 1 < self._max_delegation_depth:
            registry.register(create_delegate_task_tool(self))
        return registry

    async def _reserve_agent(self) -> bool:
        async with self._active_agents_lock:
            if self._active_agents >= self._max_active_agents:
                return False
            self._active_agents += 1
            return True

    async def _release_agent(self) -> None:
        async with self._active_agents_lock:
            self._active_agents = max(0, self._active_agents - 1)

    @staticmethod
    def _wrap_child_event(
        event: RunEvent,
        identity: dict[str, object],
        child_sequence: int,
    ) -> RunEvent:
        child_item_id = event.item_id or f"event-{child_sequence}"
        return RunEvent(
            type="agent_event",
            item_id=f"{identity['agentId']}:{child_item_id}",
            tool_call_id=event.tool_call_id,
            tool_name=event.tool_name,
            title=event.title,
            arguments=event.arguments,
            delta=event.delta,
            output=event.output,
            duration_ms=event.duration_ms,
            exit_code=event.exit_code,
            error_message=event.error_message,
            model=event.model,
            metadata={
                **event.metadata,
                **identity,
                "agentStatus": "running",
                "childEventType": event.type,
                "childSequence": child_sequence,
            },
        )

    @staticmethod
    async def _emit(context: ToolContext, event: RunEvent) -> None:
        if context.emit_event is not None:
            await context.emit_event(event)

    async def _emit_usage(
        self,
        context: ToolContext,
        usage: RunUsage | None,
        identity: dict[str, object],
    ) -> None:
        if usage is None:
            return
        await self._emit(context, RunEvent(
            type="usage",
            model=self._settings.model,
            usage=usage,
            metadata={
                "usageDelta": True,
                "usageCategory": "subagent",
                **identity,
            },
        ))


def create_delegate_task_tool(runtime: SubagentRuntime):
    async def execute(context: ToolContext, input_data: ToolInput) -> ToolResult:
        return await runtime.run(
            context,
            description=str(input_data["description"]).strip(),
            prompt=str(input_data["prompt"]).strip(),
        )

    return function_tool(
        name="delegate_task",
        description=(
            "以前台 one-shot 方式启动一个独立 Session 的子 Agent，完成边界清晰且可独立交付"
            "的任务。子 Agent 继承本次请求实际可见的工具和权限边界；调用会等待其最终报告。"
            "多个互不依赖的任务可在同一轮并行调用，最终结果由当前 Agent 核验并综合。"
        ),
        input_schema={
            "type": "object",
            "properties": {
                "description": {
                    "type": "string",
                    "description": "用于界面展示的短标签，建议 2-12 个字。",
                    "minLength": 1,
                    "maxLength": 80,
                },
                "prompt": {
                    "type": "string",
                    "description": "无需父会话即可理解的完整任务说明和预期输出。",
                    "minLength": 1,
                    "maxLength": 20000,
                },
            },
            "required": ["description", "prompt"],
            "additionalProperties": False,
        },
        execute=execute,
        category=ToolCategory.OTHER,
        read_only=True,
        concurrency_safe=True,
        validate=_validate_delegate_input,
        title=lambda data: f"启动 Agent：{str(data.get('description') or '').strip()}",
    )


def _validate_delegate_input(input_data: ToolInput) -> str | None:
    for key in ("description", "prompt"):
        value = input_data.get(key)
        if not isinstance(value, str) or not value.strip():
            return f"{key} 必须是非空字符串"
    return None


def _usage_metadata(usage: RunUsage | None) -> dict[str, object]:
    if usage is None:
        return {}
    return {
        "promptTokens": usage.prompt_tokens,
        "completionTokens": usage.completion_tokens,
        "totalTokens": usage.total_tokens,
        "activeContextTokens": usage.input_tokens,
    }
