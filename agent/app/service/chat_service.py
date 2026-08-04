from collections.abc import AsyncIterator
from pathlib import Path

import httpx

from app.dto.request.chat_completion_request import ChatCompletionRequest
from app.dto.request.model_list_request import ModelListRequest
from app.dto.response.chat_completion_response import ChatCompletionResponse
from app.dto.response.chat_stream_event_response import (
    ChatStreamEventResponse,
)
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
from app.prompt.prompt_builder import PromptBuilder
from app.prompt.prompt_context import PromptContext
from app.provider.openai_compatible_provider import OpenAICompatibleProvider
from app.tool.base import ToolContext
from app.tool.registry import ToolRegistry
from app.tool.tool_runtime import create_default_tool_registry


class ModelProviderError(RuntimeError):
    pass


class ChatService:
    def __init__(
        self,
        provider: OpenAICompatibleProvider,
        prompt_builder: PromptBuilder,
        tool_registry: ToolRegistry | None = None,
        permission_engine: PermissionEngine | None = None,
        approval_broker: ApprovalBroker | None = None,
        permission_config_store: PermissionConfigStore | None = None,
    ) -> None:
        self._provider = provider
        self._prompt_builder = prompt_builder
        self._tool_registry = tool_registry or create_default_tool_registry()
        self._permission_engine = permission_engine or PermissionEngine()
        self._approval_broker = approval_broker or ApprovalBroker()
        self._permission_config_store = (
            permission_config_store or PermissionConfigStore()
        )

    async def list_models(self, request: ModelListRequest) -> list[str]:
        connection = request
        settings = ModelConnectionSettings(
            provider_name=connection.provider_name,
            base_url=connection.base_url,
            model="_model_discovery",
            api_key=connection.api_key,
        )
        settings.validate()
        try:
            return await self._provider.list_models(settings)
        except (httpx.HTTPError, TypeError, ValueError) as error:
            raise ModelProviderError(
                "获取模型列表失败，请检查地址和 API Key"
            ) from error

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
    ) -> AsyncIterator[ChatStreamEventResponse]:
        try:
            settings = self._connection(request)
            prompt = self._prompt_builder.build(self._prompt_context(request))
            workspace_path = request.prompt_context.workspace_path
            tool_context = (
                ToolContext(
                    workspace_path=Path(workspace_path)
                    .expanduser()
                    .resolve(strict=True),
                    correlation_id=correlation_id,
                )
                if workspace_path and prompt.tools
                else None
            )
            stream = (
                self._provider.agent_stream(
                    settings,
                    prompt,
                    request.messages,
                    request.reasoning_effort,
                    self._tool_registry,
                    tool_context,
                    self._permission_config_store.load_policy(
                        tool_context.workspace_path,
                        self._permission_policy(request),
                    ),
                    self._permission_engine,
                    self._approval_broker,
                    self._permission_config_store,
                )
                if tool_context is not None
                else self._provider.stream(
                    settings,
                    prompt,
                    request.messages,
                    request.reasoning_effort,
                )
            )
            async for event in stream:
                yield event
        except (httpx.HTTPError, OSError, TypeError, ValueError) as error:
            raise ModelProviderError(
                "模型 API 流式调用失败，请检查地址、Key 和模型名称"
            ) from error

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

    def _prompt_context(self, request: ChatCompletionRequest) -> PromptContext:
        context = request.prompt_context
        allowed_names = tuple(
            name
            for name in context.available_tools
            if name in self._tool_registry.names()
        )
        return PromptContext(
            workspace_path=context.workspace_path,
            project_instructions=tuple(context.project_instructions),
            available_tools=allowed_names,
            tool_definitions=self._tool_registry.model_definitions(allowed_names),
            memory_summary=context.memory_summary,
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
        )
        settings.validate()
        return settings
