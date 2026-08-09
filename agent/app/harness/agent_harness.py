from collections.abc import AsyncIterator

from app.context.planner import ContextPlanner
from app.dto.request.chat_completion_request import ChatMessageRequest
from app.execution.tool_result_processor import ToolResultProcessor
from app.harness.agent_loop import AgentLoopRunner
from app.harness.contracts import PromptSupplier
from app.harness.ports.model_provider import ModelProviderPort
from app.harness.run_event import RunEvent
from app.model.model_connection_settings import ModelConnectionSettings
from app.permission.broker import ApprovalBroker
from app.permission.config_store import PermissionConfigStore
from app.permission.engine import PermissionEngine
from app.permission.model import PermissionPolicy
from app.prompt.prompt_assembly import PromptAssembly
from app.tool.base import ToolContext
from app.tool.registry import ToolRegistry


class AgentHarness:
    """连接模型、上下文与工具执行的一次 Agent 运行边界。"""

    def __init__(
        self,
        provider: ModelProviderPort,
        context_planner: ContextPlanner | None = None,
        result_processor: ToolResultProcessor | None = None,
    ) -> None:
        self._provider = provider
        self._context_planner = context_planner
        self._result_processor = result_processor

    async def stream(
        self,
        settings: ModelConnectionSettings,
        prompt: PromptAssembly,
        messages: list[ChatMessageRequest],
        reasoning_effort: str | None,
        registry: ToolRegistry,
        tool_context: ToolContext | None,
        permission_policy: PermissionPolicy,
        permission_engine: PermissionEngine,
        approval_broker: ApprovalBroker,
        permission_config_store: PermissionConfigStore,
        prompt_supplier: PromptSupplier,
        conversation_summary: str | None,
    ) -> AsyncIterator[RunEvent]:
        if tool_context is None or not prompt.tools:
            async for event in self._provider.stream(
                settings,
                prompt,
                messages,
                reasoning_effort,
            ):
                yield event
            return

        runner = AgentLoopRunner(
            self._provider.complete_agent_turn,
            self._provider.compact_agent_history,
            prompt_supplier,
            self._context_planner,
            self._result_processor,
            stream_turn=getattr(self._provider, "stream_agent_turn", None),
        )
        async for event in runner.stream(
            settings,
            prompt,
            messages,
            reasoning_effort,
            registry,
            tool_context,
            permission_policy,
            permission_engine,
            approval_broker,
            permission_config_store,
            conversation_summary,
        ):
            yield event
