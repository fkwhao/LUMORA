import asyncio
import logging
import uuid
from collections.abc import AsyncIterator
from dataclasses import replace
from pathlib import Path

import httpx

from app.artifact.store import ArtifactStore
from app.context.planner import ContextPlanner
from app.dto.request.artifact_request import ArtifactReadRequest, ArtifactSearchRequest
from app.dto.request.chat_completion_request import ChatCompletionRequest
from app.dto.request.model_list_request import ModelListRequest
from app.dto.response.chat_completion_response import (
    ChatCompletionResponse,
    TokenUsageResponse,
)
from app.dto.response.context_compaction_response import ContextCompactionResponse
from app.exception.provider_errors import ModelProviderError
from app.execution.budget import (
    BudgetExceeded,
    ExecutionBudgetLedger,
    ExecutionBudgetLimits,
)
from app.harness.agent_harness import AgentHarness
from app.harness.ports.model_provider import ModelProviderPort
from app.harness.run_control import (
    RunControlRegistry,
    await_or_pause,
)
from app.harness.run_event import RunEvent, RunUsage
from app.mcp.capability_adapter import create_mcp_capability_tools
from app.mcp.client import McpClient, McpConnectionError
from app.mcp.exposure_policy import (
    should_connect_server,
    should_expose_capability_tools,
)
from app.mcp.session_pool import McpSessionLease, McpSessionPool
from app.mcp.tool_adapter import create_mcp_tool
from app.memory.retrieval import MemoryRetriever
from app.model.model_connection_settings import ModelConnectionSettings
from app.permission.broker import ApprovalBroker
from app.permission.config_store import PermissionConfigStore
from app.permission.engine import PermissionEngine
from app.permission.model import (
    ApprovalDecision,
    PermissionDecision,
    PermissionMode,
    PermissionPolicy,
    PermissionRule,
)
from app.prompt.project_instruction_loader import ProjectInstructionLoader
from app.prompt.prompt_builder import PromptBuilder
from app.prompt.prompt_context import PromptContext
from app.provider.token_usage import add_token_usage, empty_token_usage
from app.service.mcp_service import to_mcp_config
from app.skill.catalog import SkillCatalog
from app.subagent.continuable import ContinuableSessionManager
from app.subagent.runtime import SubagentRuntime, create_delegate_task_tool
from app.subagent.workflow import WorkflowManager
from app.tool.base import ToolAttachment, ToolContext
from app.tool.default_registry import create_default_tool_registry
from app.tool.registry import ToolRegistry

logger = logging.getLogger(__name__)


class ChatService:
    def __init__(
        self,
        provider: ModelProviderPort,
        prompt_builder: PromptBuilder,
        tool_registry: ToolRegistry | None = None,
        permission_engine: PermissionEngine | None = None,
        approval_broker: ApprovalBroker | None = None,
        permission_config_store: PermissionConfigStore | None = None,
        context_planner: ContextPlanner | None = None,
        artifact_store: ArtifactStore | None = None,
        agent_harness: AgentHarness | None = None,
        memory_retriever: MemoryRetriever | None = None,
        project_instruction_loader: ProjectInstructionLoader | None = None,
        skill_catalog: SkillCatalog | None = None,
        run_controls: RunControlRegistry | None = None,
        mcp_session_pool: McpSessionPool | None = None,
        max_parallel_tool_calls: int = 10,
    ) -> None:
        self._provider = provider
        self._prompt_builder = prompt_builder
        self._tool_registry = tool_registry or create_default_tool_registry()
        self._permission_engine = permission_engine or PermissionEngine()
        self._approval_broker = approval_broker or ApprovalBroker()
        self._permission_config_store = (
            permission_config_store or PermissionConfigStore()
        )
        self._context_planner = context_planner or ContextPlanner()
        self._artifact_store = artifact_store or ArtifactStore()
        self._agent_harness = agent_harness
        self._memory_retriever = memory_retriever or MemoryRetriever()
        self._project_instruction_loader = (
            project_instruction_loader or ProjectInstructionLoader()
        )
        self._skill_catalog = skill_catalog or SkillCatalog()
        self._run_controls = run_controls or RunControlRegistry()
        self._mcp_session_pool = mcp_session_pool or McpSessionPool()
        self._max_parallel_tool_calls = max_parallel_tool_calls

    async def pause_run(self, run_id: str) -> bool:
        return await self._run_controls.pause(run_id)

    async def add_steer(
        self, run_id: str, input_id: str, content: str
    ) -> bool:
        return await self._run_controls.add_steer(
            run_id, input_id, content.strip()
        )

    async def replace_steer(
        self, run_id: str, input_id: str, content: str
    ) -> bool:
        return await self._run_controls.replace_steer(
            run_id, input_id, content.strip()
        )

    async def remove_steer(self, run_id: str, input_id: str) -> bool:
        return await self._run_controls.remove_steer(run_id, input_id)

    async def close(self) -> None:
        await self._mcp_session_pool.close()

    async def list_models(self, request: ModelListRequest) -> list[str]:
        connection = request
        settings = ModelConnectionSettings(
            provider_name=connection.provider_name,
            base_url=connection.base_url,
            model="_model_discovery",
            api_key=connection.api_key,
            api_format=connection.api_format,
        )
        settings.validate()
        try:
            return await self._provider.list_models(settings)
        except (httpx.HTTPError, TypeError, ValueError) as error:
            raise ModelProviderError(
                "获取模型列表失败，请检查地址和 API Key"
            ) from error

    def read_artifact(self, request: ArtifactReadRequest) -> dict[str, object]:
        return self._artifact_store.read(
            request.task_id,
            request.artifact_id,
            offset=request.offset,
            limit=request.limit,
        )

    def search_artifact(self, request: ArtifactSearchRequest) -> dict[str, object]:
        return self._artifact_store.search(
            request.task_id,
            request.artifact_id,
            request.query,
            max_results=request.max_results,
        )

    async def complete(
        self,
        request: ChatCompletionRequest,
    ) -> ChatCompletionResponse:
        settings = self._connection(request)
        prompt = self._prompt_builder.build(self._prompt_context(request))
        try:
            return await self._provider.complete(
                settings,
                prompt,
                request.messages,
                request.reasoning_effort,
            )
        except (httpx.HTTPError, TypeError, ValueError) as error:
            # Provider 响应可能包含敏感内容，HTTP 边界只返回稳定错误。
            raise ModelProviderError(
                "模型 API 调用失败，请检查地址、Key 和模型名称"
            ) from error

    async def stream(
        self,
        request: ChatCompletionRequest,
        correlation_id: str = "",
    ) -> AsyncIterator[RunEvent]:
        run_id = (
            correlation_id
            or request.prompt_context.task_id
            or f"local-{uuid.uuid4()}"
        )
        run_control = self._run_controls.register(run_id)
        runtime_registry = self._tool_registry
        mcp_leases: list[McpSessionLease] = []
        prelude_usage = empty_token_usage()
        budget_request = request.prompt_context.execution_budget
        execution_budget = ExecutionBudgetLedger(ExecutionBudgetLimits(
            max_total_tokens=budget_request.max_total_tokens,
            max_model_requests=budget_request.max_model_requests,
            max_tool_calls=budget_request.max_tool_calls,
            max_wall_time_ms=budget_request.max_wall_time_ms,
            max_active_agents=budget_request.max_active_agents,
        ))
        try:
            if self._selected_mcp_servers(request):
                yield RunEvent(
                    type="progress_message",
                    title="正在准备可用工具",
                    delta="正在复用或连接任务所需的 MCP 服务",
                    metadata={"category": "runtime_preparation"},
                )
            runtime_registry, mcp_leases, mcp_errors = (
                await self._prepare_mcp_registry(request)
            )
            settings = self._connection(request)
            workspace_path = request.prompt_context.workspace_path
            resolved_workspace = (
                Path(workspace_path).expanduser().resolve(strict=True)
                if workspace_path
                else None
            )
            base_permission_policy = self._permission_policy(request)
            permission_policy = base_permission_policy
            if resolved_workspace is not None:
                permission_policy = self._permission_config_store.load_policy(
                    resolved_workspace,
                    permission_policy,
                )
            runtime_registry = runtime_registry.copy()
            subagent_runtime = SubagentRuntime(
                harness=self._resolve_agent_harness(),
                settings=settings,
                reasoning_effort=request.reasoning_effort,
                source_registry=runtime_registry,
                prompt_builder=self._prompt_builder,
                project_instructions=(
                    tuple(request.prompt_context.project_instructions)
                    + self._project_instruction_loader.load(
                        request.prompt_context.workspace_path
                    )
                ),
                permission_engine=self._permission_engine,
                approval_broker=self._approval_broker,
                permission_config_store=self._permission_config_store,
                permission_policy=base_permission_policy,
                run_control=run_control,
                max_active_agents=budget_request.max_active_agents,
                execution_budget=execution_budget,
            )
            session_manager = ContinuableSessionManager(
                subagent_runtime,
                tuple(request.prompt_context.agent_sessions),
            )
            subagent_runtime.bind_session_manager(session_manager)
            runtime_registry.register(
                create_delegate_task_tool(subagent_runtime)
            )
            for tool in session_manager.tools():
                runtime_registry.register(tool)
            workflow_manager = WorkflowManager(
                subagent_runtime,
                tuple(request.prompt_context.workflow_snapshots),
            )
            for tool in workflow_manager.tools():
                runtime_registry.register(tool)
            prompt_context = self._prompt_context(
                request,
                tool_registry=runtime_registry,
            )
            subagent_runtime.bind_allowed_tools(
                prompt_context.available_tools,
                mcp_tool_names=prompt_context.mcp_tool_names,
                available_skills=prompt_context.available_skills,
            )
            prompt = self._prompt_builder.build(prompt_context)
            request_messages = request.messages
            active_summary = request.prompt_context.conversation_summary
            for server_name, message in mcp_errors:
                yield RunEvent(
                    type="progress_message",
                    title=f"MCP 连接失败：{server_name}",
                    delta=message,
                    metadata={"category": "mcp_connection"},
                )
            if prompt_context.selected_memory_ids:
                yield RunEvent(
                    type="progress_message",
                    title="已检索相关记忆",
                    metadata={
                        "category": "memory_retrieval",
                        "memoryIds": list(prompt_context.selected_memory_ids),
                    },
                )
            should_compact, before_tokens, _threshold = (
                self._context_planner.should_compact(
                    settings, prompt, request_messages
                )
            )
            if should_compact:
                compactable, retained = self._context_planner.split_for_compaction(
                    request_messages
                )
                if compactable:
                    item_id = f"context-{correlation_id or 'auto'}"
                    yield RunEvent(
                        type="context_compaction_started",
                        item_id=item_id,
                        title="自动整理上下文",
                        delta="正在分析历史消息…",
                        model=settings.model,
                    )
                    try:
                        execution_budget.reserve_model_request()
                        paused, compacted = await await_or_pause(
                            self._provider.compact_context(
                                settings,
                                compactable,
                                request.prompt_context.conversation_summary,
                            ),
                            run_control,
                        )
                        if paused:
                            yield RunEvent(
                                type="paused",
                                model=settings.model,
                                metadata={
                                    "turnStatus": "aborted",
                                    "pauseReason": "user",
                                },
                            )
                            return
                        assert compacted is not None
                        execution_budget.settle_tokens(
                            compacted.usage.total_tokens
                        )
                    except BudgetExceeded as error:
                        yield RunEvent(
                            type="failed",
                            error_message=str(error),
                            model=settings.model,
                            metadata=error.metadata(),
                        )
                        return
                    except (httpx.HTTPError, TypeError, ValueError):
                        yield RunEvent(
                            type="context_compaction_failed",
                            item_id=item_id,
                            title="上下文压缩失败",
                            delta="未修改既有上下文",
                            error_message="上下文压缩失败",
                            model=settings.model,
                        )
                        raise
                    plan = self._context_planner.completed_plan(
                        prompt,
                        request_messages,
                        retained,
                        compacted.message,
                        before_tokens,
                    )
                    request_messages = plan.messages
                    active_summary = plan.summary
                    prelude_usage = add_token_usage(
                        (prelude_usage, compacted.usage)
                    )
                    prompt = self._prompt_builder.build(
                        self._prompt_context(
                            request,
                            plan.summary,
                            runtime_registry,
                        )
                    )
                    yield RunEvent(
                        type="context_compacted",
                        item_id=item_id,
                        title="已压缩上下文",
                        delta=(
                            f"已压缩上下文 · {plan.before_tokens} → "
                            f"{plan.after_tokens} Token"
                        ),
                        metadata={
                            "summary": plan.summary,
                            "beforeTokens": plan.before_tokens,
                            "afterTokens": plan.after_tokens,
                            "throughSequence": plan.through_sequence,
                            "retainedFromSequence": plan.retained_from_sequence,
                            "trigger": "auto",
                            "usage": compacted.usage.model_dump(by_alias=True),
                        },
                        model=compacted.model,
                        usage=_to_run_usage(prelude_usage),
                        active_context_tokens=plan.after_tokens,
                    )
            background_events: asyncio.Queue[RunEvent] = asyncio.Queue()
            tool_context = ToolContext(
                workspace_path=resolved_workspace or Path.cwd().resolve(),
                workspace_scoped=resolved_workspace is not None,
                correlation_id=run_id,
                task_id=request.prompt_context.task_id or run_id,
                session_id=run_id,
                agent_id="supervisor",
                artifact_store=self._artifact_store,
                attachments=self._tool_attachments(request),
                background_event=background_events.put,
                execution_budget=execution_budget,
            )
            workflow_manager.restore_durable(tool_context)
            workflow_manager.restore_from_messages(request.messages, tool_context)
            if prompt.tools:
                await session_manager.publish_recovery_events(tool_context)
            stream = self._resolve_agent_harness().stream(
                settings,
                prompt,
                request_messages,
                request.reasoning_effort,
                runtime_registry,
                tool_context,
                permission_policy,
                self._permission_engine,
                self._approval_broker,
                self._permission_config_store,
                lambda summary: self._prompt_builder.build(
                    self._prompt_context(request, summary, runtime_registry)
                ),
                active_summary,
                run_control,
            )
            async for event in _stream_with_background_events(
                stream,
                background_events,
                session_manager,
            ):
                yield _with_prelude_usage(event, prelude_usage)
        except (httpx.HTTPError, OSError, TypeError, ValueError) as error:
            logger.warning(
                "Model stream failed correlation_id=%s provider=%s "
                "api_format=%s model=%s error_type=%s",
                correlation_id,
                settings.provider_name,
                settings.api_format,
                settings.model,
                type(error).__name__,
                exc_info=True,
            )
            raise ModelProviderError(
                "模型 API 流式调用失败，请检查地址、Key 和模型名称"
            ) from error
        finally:
            for lease in reversed(mcp_leases):
                await lease.release()
            self._run_controls.unregister(run_id, run_control)

    def decide_tool_approval(
        self,
        approval_id: str,
        decision: ApprovalDecision,
        correlation_id: str,
    ) -> bool:
        return self._approval_broker.decide(
            approval_id,
            decision,
            correlation_id,
        )

    def _resolve_agent_harness(self) -> AgentHarness:
        if self._agent_harness is None:
            self._agent_harness = AgentHarness(
                self._provider,
                self._context_planner,
                max_parallel_tool_calls=self._max_parallel_tool_calls,
            )
        return self._agent_harness

    @staticmethod
    def _permission_policy(request: ChatCompletionRequest) -> PermissionPolicy:
        context = request.prompt_context
        return PermissionPolicy(
            mode=PermissionMode(context.permission_mode),
            rules=tuple(
                PermissionRule(
                    tool=rule.tool,
                    pattern=rule.pattern,
                    decision=PermissionDecision(rule.decision),
                )
                for rule in context.permission_rules
            ),
        )

    async def compact(
        self,
        request: ChatCompletionRequest,
    ) -> ContextCompactionResponse:
        settings = self._connection(request)
        prompt = self._prompt_builder.build(self._prompt_context(request))
        compactable, retained = self._context_planner.split_for_compaction(
            request.messages,
            force=True,
        )
        if not compactable:
            raise ValueError("没有需要压缩的较早消息")
        before_tokens = self._context_planner.should_compact(
            settings, prompt, request.messages
        )[1]
        try:
            response = await self._provider.compact_context(
                settings,
                compactable,
                request.prompt_context.conversation_summary,
            )
        except (httpx.HTTPError, TypeError, ValueError) as error:
            raise ModelProviderError("上下文压缩失败") from error
        plan = self._context_planner.completed_plan(
            prompt,
            request.messages,
            retained,
            response.message,
            before_tokens,
        )
        return ContextCompactionResponse(
            summary=plan.summary or response.message,
            beforeTokens=plan.before_tokens,
            afterTokens=plan.after_tokens,
            throughSequence=plan.through_sequence,
            retainedFromSequence=plan.retained_from_sequence,
            usage=response.usage,
        )

    def _prompt_context(
        self,
        request: ChatCompletionRequest,
        conversation_summary: str | None = None,
        tool_registry: ToolRegistry | None = None,
    ) -> PromptContext:
        context = request.prompt_context
        current_request = self._current_user_request(request)
        selection = self._memory_retriever.select(
            context.memory_candidates,
            current_request,
        )
        file_instructions = self._project_instruction_loader.load(
            context.workspace_path
        )
        registry = tool_registry or self._tool_registry
        skills = self._skill_catalog.discover(context.workspace_path)
        attachment_tool_names = self._attachment_tool_names(request)
        registered_names = registry.names()
        request_local_names = tuple(
            name
            for name in (
                "delegate_task",
                "send_agent_message",
                "list_agent_sessions",
                "interrupt_agent",
                "report_to_parent",
                "create_workflow",
                "list_workflows",
                "run_workflow",
                "retry_workflow_node",
            )
            if name in registered_names
        )
        base_names = {
            *self._tool_registry.names(),
            *request_local_names,
        }
        mcp_names = tuple(
            name for name in registered_names if name not in base_names
        )
        if context.available_tools:
            allowed_local_names = tuple(
                name
                for name in context.available_tools
                if name in registered_names
            )
            skill_tool_names = tuple(
                name for name in ("load_skill", "read_skill_resource")
                if skills and name in registered_names
            )
            allowed_names = tuple(dict.fromkeys(
                (
                    *allowed_local_names,
                    *attachment_tool_names,
                    *skill_tool_names,
                    *request_local_names,
                    *mcp_names,
                )
            ))
        elif context.workspace_path:
            allowed_names = tuple(
                name for name in registered_names
                if skills or name not in {"load_skill", "read_skill_resource"}
            )
        else:
            allowed_names = tuple(dict.fromkeys((
                *attachment_tool_names,
                *(name for name in ("load_skill", "read_skill_resource")
                  if skills and name in registered_names),
                *request_local_names,
                *mcp_names,
            )))
        return PromptContext(
            workspace_path=context.workspace_path,
            project_instructions=(
                tuple(context.project_instructions) + file_instructions
            ),
            available_tools=allowed_names,
            mcp_tool_names=tuple(
                name for name in allowed_names if name in mcp_names
            ),
            tool_definitions=registry.model_definitions(allowed_names),
            memory_summary=(
                None if context.memory_candidates else context.memory_summary
            ),
            user_memory=selection.user_memory,
            project_memory=selection.project_memory,
            conversation_memory=selection.conversation_memory,
            selected_memory_ids=selection.memory_ids,
            conversation_summary=(
                conversation_summary
                if conversation_summary is not None
                else context.conversation_summary
            ),
            available_skills=skills,
        )

    async def _prepare_mcp_registry(
        self,
        request: ChatCompletionRequest,
    ) -> tuple[
        ToolRegistry,
        list[McpSessionLease],
        list[tuple[str, str]],
    ]:
        servers = self._selected_mcp_servers(request)
        if not servers:
            return self._tool_registry, [], []

        if request.prompt_context.workspace_path:
            registry = self._tool_registry.copy()
        else:
            user_skills = self._skill_catalog.discover()
            attachment_tool_names = self._attachment_tool_names(request)
            registry = self._tool_registry.select(
                name
                for name in (
                    *attachment_tool_names,
                    "load_skill",
                    "read_skill_resource",
                )
                if (
                    name in attachment_tool_names
                    or user_skills
                )
                and name in self._tool_registry.names()
            )
        expose_capabilities = should_expose_capability_tools(
            self._current_user_request(request)
        )
        errors: list[tuple[str, str]] = []
        leases: list[McpSessionLease] = []
        task_scope = (
            request.prompt_context.task_id
            or request.prompt_context.workspace_path
            or "unscoped"
        )

        async def connect(server):
            try:
                lease = await self._mcp_session_pool.acquire(
                    task_scope,
                    to_mcp_config(server),
                    McpClient,
                )
                return server, lease, None
            except (
                McpConnectionError,
                OSError,
                TimeoutError,
                TypeError,
                ValueError,
            ) as error:
                return server, None, error

        connected = await asyncio.gather(*(connect(server) for server in servers))
        leases.extend(
            lease
            for _server, lease, error in connected
            if error is None and lease is not None
        )
        errors.extend(
            (server.name, str(error))
            for server, _lease, error in connected
            if error is not None
        )
        try:
            for server, lease, error in connected:
                if error is None and lease is not None:
                    session = lease.session
                    client = session.client
                    server_tools = [
                        *(
                            create_mcp_tool(client, definition)
                            for definition in session.tools
                        ),
                        *(
                            create_mcp_capability_tools(client)
                            if expose_capabilities
                            else ()
                        ),
                    ]
                    tool_names = [tool.name for tool in server_tools]
                    if len(tool_names) != len(set(tool_names)):
                        raise ValueError("MCP Server 返回了重复的工具名称")
                    existing_names = set(registry.names())
                    if any(name in existing_names for name in tool_names):
                        raise ValueError("MCP 工具名称与现有工具冲突")
                    for tool in server_tools:
                        registry.register(tool)
        except BaseException:
            await asyncio.gather(
                *(lease.release() for lease in leases),
                return_exceptions=True,
            )
            raise
        return registry, leases, errors

    def _selected_mcp_servers(self, request: ChatCompletionRequest) -> list:
        current_request = self._current_user_request(request)
        return [
            server
            for server in request.prompt_context.mcp_servers
            if server.enabled and should_connect_server(current_request, server)
        ]

    @staticmethod
    def _current_user_request(request: ChatCompletionRequest) -> str:
        persisted = next(
            (
                message.content
                for message in reversed(request.messages)
                if message.role == "user"
                and message.content
                and message.message_id
            ),
            None,
        )
        if persisted:
            return persisted
        return next(
            (
                message.content
                for message in reversed(request.messages)
                if message.role == "user" and message.content
            ),
            "",
        )

    def _attachment_tool_names(
        self,
        request: ChatCompletionRequest,
    ) -> tuple[str, ...]:
        has_pdf = any(
            attachment.mime_type.casefold() == "application/pdf"
            for message in request.messages
            for attachment in message.attachments
        )
        return (
            ("read_pdf", "search_pdf")
            if has_pdf
            and {"read_pdf", "search_pdf"}.issubset(
                self._tool_registry.names()
            )
            else ()
        )

    @staticmethod
    def _tool_attachments(
        request: ChatCompletionRequest,
    ) -> dict[str, ToolAttachment]:
        attachments: dict[str, ToolAttachment] = {}
        for message in request.messages:
            for attachment in message.attachments:
                if attachment.mime_type.casefold() != "application/pdf":
                    continue
                candidate = ToolAttachment(
                    attachment_id=attachment.attachment_id,
                    name=attachment.name,
                    mime_type=attachment.mime_type,
                    path=Path(attachment.path),
                    size=attachment.size,
                )
                existing = attachments.get(candidate.attachment_id)
                if existing is not None and existing != candidate:
                    raise ValueError("同一附件 ID 对应了不同的 PDF 引用")
                attachments[candidate.attachment_id] = candidate
        return attachments

    @staticmethod
    def _connection(
        request: ChatCompletionRequest,
    ) -> ModelConnectionSettings:
        """将 Java 提供的连接参数转为瞬时配置，不在 Python 侧落盘。"""
        connection = request.connection
        settings = ModelConnectionSettings(
            provider_name=connection.provider_name,
            base_url=connection.base_url,
            model=connection.model,
            api_key=connection.api_key,
            max_output_tokens=connection.max_output_tokens,
            context_window=connection.context_window,
            api_format=connection.api_format,
            web_search_enabled=connection.web_search_enabled,
        )
        settings.validate()
        return settings


def _to_run_usage(usage: TokenUsageResponse) -> RunUsage:
    return RunUsage(
        prompt_tokens=usage.prompt_tokens,
        completion_tokens=usage.completion_tokens,
        total_tokens=usage.total_tokens,
        input_tokens=usage.input_tokens,
        output_tokens=usage.output_tokens,
        reasoning_tokens=usage.reasoning_tokens,
        cache_read_tokens=usage.cache_read_tokens,
        cache_write_tokens=usage.cache_write_tokens,
        cache_metrics_available=usage.cache_metrics_available,
    )


def _with_prelude_usage(
    event: RunEvent,
    prelude: TokenUsageResponse,
) -> RunEvent:
    if (
        event.usage is None
        or event.metadata.get("usageDelta") is True
        or not _has_billable_usage(prelude)
    ):
        return event
    usage = event.usage
    return replace(
        event,
        usage=RunUsage(
            prompt_tokens=prelude.prompt_tokens + usage.prompt_tokens,
            completion_tokens=(
                prelude.completion_tokens + usage.completion_tokens
            ),
            total_tokens=prelude.total_tokens + usage.total_tokens,
            input_tokens=prelude.input_tokens + usage.input_tokens,
            output_tokens=prelude.output_tokens + usage.output_tokens,
            reasoning_tokens=(
                prelude.reasoning_tokens + usage.reasoning_tokens
            ),
            cache_read_tokens=(
                prelude.cache_read_tokens + usage.cache_read_tokens
            ),
            cache_write_tokens=(
                prelude.cache_write_tokens + usage.cache_write_tokens
            ),
            cache_metrics_available=(
                prelude.cache_metrics_available
                or usage.cache_metrics_available
            ),
        ),
    )


def _has_billable_usage(usage: TokenUsageResponse) -> bool:
    return any((
        usage.prompt_tokens,
        usage.completion_tokens,
        usage.total_tokens,
        usage.input_tokens,
        usage.output_tokens,
        usage.reasoning_tokens,
        usage.cache_read_tokens,
        usage.cache_write_tokens,
    ))


async def _stream_with_background_events(
    stream: AsyncIterator[RunEvent],
    background_events: asyncio.Queue[RunEvent],
    session_manager: ContinuableSessionManager,
) -> AsyncIterator[RunEvent]:
    """Merge root and Activation events, committing root completion last."""
    iterator = stream.__aiter__()
    main_task: asyncio.Task[RunEvent] | None = asyncio.create_task(
        _next_run_event(iterator)
    )
    background_task: asyncio.Task[RunEvent] | None = asyncio.create_task(
        background_events.get()
    )
    activation_task: asyncio.Task[None] | None = None
    terminal_event: RunEvent | None = None
    try:
        while main_task is not None:
            wait_for = {main_task}
            if background_task is not None:
                wait_for.add(background_task)
            done, _pending = await asyncio.wait(
                wait_for,
                return_when=asyncio.FIRST_COMPLETED,
            )
            if background_task is not None and background_task in done:
                yield background_task.result()
                background_task = asyncio.create_task(background_events.get())
            if main_task in done:
                try:
                    event = main_task.result()
                except StopAsyncIteration:
                    main_task = None
                else:
                    if event.type in {"completed", "failed", "paused"}:
                        terminal_event = event
                    else:
                        yield event
                    main_task = asyncio.create_task(_next_run_event(iterator))

        activation_task = asyncio.create_task(
            session_manager.shutdown()
            if terminal_event is not None and terminal_event.type == "failed"
            else session_manager.wait_for_activations()
        )
        while not activation_task.done():
            if not background_events.empty():
                yield background_events.get_nowait()
                continue
            if background_task is None:
                background_task = asyncio.create_task(background_events.get())
            done, _pending = await asyncio.wait(
                {activation_task, background_task},  # type: ignore[arg-type]
                return_when=asyncio.FIRST_COMPLETED,
            )
            if background_task in done:
                yield background_task.result()
                background_task = asyncio.create_task(background_events.get())

        await activation_task
        if background_task is not None and background_task.done():
            yield background_task.result()
            background_task = None
        while not background_events.empty():
            yield background_events.get_nowait()
        if terminal_event is not None:
            yield terminal_event
    finally:
        for task in (main_task, background_task, activation_task):
            if task is not None and not task.done():
                task.cancel()
        await session_manager.shutdown()


async def _next_run_event(iterator: AsyncIterator[RunEvent]) -> RunEvent:
    return await iterator.__anext__()
