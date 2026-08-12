import logging
from collections.abc import AsyncIterator
from pathlib import Path

import httpx

from app.artifact.store import ArtifactStore
from app.context.planner import ContextPlanner
from app.dto.request.artifact_request import ArtifactReadRequest, ArtifactSearchRequest
from app.dto.request.chat_completion_request import ChatCompletionRequest
from app.dto.request.model_list_request import ModelListRequest
from app.dto.response.chat_completion_response import ChatCompletionResponse
from app.dto.response.context_compaction_response import ContextCompactionResponse
from app.exception.provider_errors import ModelProviderError
from app.harness.agent_harness import AgentHarness
from app.harness.ports.model_provider import ModelProviderPort
from app.harness.run_event import RunEvent
from app.mcp.capability_adapter import create_mcp_capability_tools
from app.mcp.client import McpClient, McpConnectionError
from app.mcp.exposure_policy import (
    should_connect_server,
    should_expose_capability_tools,
)
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
from app.service.mcp_service import to_mcp_config
from app.tool.base import ToolContext
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
        runtime_registry = self._tool_registry
        mcp_clients: list[McpClient] = []
        try:
            runtime_registry, mcp_clients, mcp_errors = (
                await self._prepare_mcp_registry(request)
            )
            settings = self._connection(request)
            prompt_context = self._prompt_context(
                request,
                tool_registry=runtime_registry,
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
                        compacted = await self._provider.compact_context(
                            settings,
                            compactable,
                            request.prompt_context.conversation_summary,
                        )
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
                        active_context_tokens=plan.after_tokens,
                    )
            workspace_path = request.prompt_context.workspace_path
            resolved_workspace = (
                Path(workspace_path).expanduser().resolve(strict=True)
                if workspace_path
                else None
            )
            tool_context = (
                ToolContext(
                    workspace_path=resolved_workspace or Path.cwd().resolve(),
                    workspace_scoped=resolved_workspace is not None,
                    correlation_id=correlation_id,
                    task_id=request.prompt_context.task_id or correlation_id,
                    artifact_store=self._artifact_store,
                )
                if prompt.tools
                else None
            )
            permission_policy = self._permission_policy(request)
            if resolved_workspace is not None:
                permission_policy = self._permission_config_store.load_policy(
                    resolved_workspace,
                    permission_policy,
                )
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
                    self._prompt_context(request, summary)
                ),
                active_summary,
            )
            async for event in stream:
                yield event
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
            for client in reversed(mcp_clients):
                await client.close()

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
        registered_names = registry.names()
        base_names = set(self._tool_registry.names())
        mcp_names = tuple(
            name for name in registered_names if name not in base_names
        )
        if context.available_tools:
            allowed_local_names = tuple(
                name
                for name in context.available_tools
                if name in registered_names
            )
            allowed_names = tuple(dict.fromkeys((*allowed_local_names, *mcp_names)))
        elif context.workspace_path:
            allowed_names = registered_names
        else:
            allowed_names = mcp_names
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
        )

    async def _prepare_mcp_registry(
        self,
        request: ChatCompletionRequest,
    ) -> tuple[
        ToolRegistry,
        list[McpClient],
        list[tuple[str, str]],
    ]:
        current_request = self._current_user_request(request)
        servers = [
            server
            for server in request.prompt_context.mcp_servers
            if server.enabled and should_connect_server(current_request, server)
        ]
        if not servers:
            return self._tool_registry, [], []

        registry = (
            self._tool_registry.copy()
            if request.prompt_context.workspace_path
            else ToolRegistry()
        )
        expose_capabilities = should_expose_capability_tools(
            current_request
        )
        clients: list[McpClient] = []
        errors: list[tuple[str, str]] = []
        for server in servers:
            client = McpClient(to_mcp_config(server))
            try:
                await client.connect()
                definitions = await client.list_tools()
                server_tools = [
                    *(
                        create_mcp_tool(client, definition)
                        for definition in definitions
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
                clients.append(client)
            except (
                McpConnectionError,
                OSError,
                TimeoutError,
                TypeError,
                ValueError,
            ) as error:
                await client.close()
                errors.append((server.name, str(error)))
        return registry, clients, errors

    @staticmethod
    def _current_user_request(request: ChatCompletionRequest) -> str:
        return next(
            (
                message.content
                for message in reversed(request.messages)
                if message.role == "user"
            ),
            "",
        )

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
