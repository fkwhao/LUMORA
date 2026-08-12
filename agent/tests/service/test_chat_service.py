import asyncio
from collections.abc import AsyncIterator
from typing import Any, ClassVar

from app.dto.request.chat_completion_request import ChatCompletionRequest
from app.dto.request.model_list_request import ModelListRequest
from app.harness.run_event import RunEvent
from app.mcp.model import McpServerConfig, McpToolDefinition
from app.model.model_connection_settings import ModelConnectionSettings
from app.prompt.prompt_builder import PromptBuilder
from app.service.chat_service import ChatService


class ModelListProvider:
    def __init__(self) -> None:
        self.settings: ModelConnectionSettings | None = None

    async def list_models(
        self,
        settings: ModelConnectionSettings,
    ) -> list[str]:
        self.settings = settings
        return ["example-model"]


def test_list_models_does_not_require_chat_output_settings() -> None:
    provider = ModelListProvider()
    service = ChatService(provider, PromptBuilder())  # type: ignore[arg-type]

    models = asyncio.run(
        service.list_models(
            ModelListRequest(
                providerName="OpenAI compatible",
                baseUrl="https://example.com/v1",
                apiKey="secret",
            )
        )
    )

    assert models == ["example-model"]
    assert provider.settings is not None
    assert provider.settings.max_output_tokens is None


class CapturingHarness:
    def __init__(self) -> None:
        self.registry: Any = None
        self.tool_context: Any = None
        self.prompt: Any = None

    async def stream(
        self,
        _settings: Any,
        prompt: Any,
        _messages: Any,
        _reasoning_effort: Any,
        registry: Any,
        tool_context: Any,
        *_args: Any,
    ) -> AsyncIterator[RunEvent]:
        self.prompt = prompt
        self.registry = registry
        self.tool_context = tool_context
        if False:
            yield RunEvent(type="completed")


class FakeMcpClient:
    instances: ClassVar[list["FakeMcpClient"]] = []

    def __init__(self, config: McpServerConfig) -> None:
        self.config = config
        self.closed = False
        self.instances.append(self)

    async def connect(self) -> None:
        return None

    def supports(self, _capability: str) -> bool:
        return False

    async def list_tools(self) -> tuple[McpToolDefinition, ...]:
        return (
            McpToolDefinition(
                name="echo",
                description="Return text unchanged",
                input_schema={
                    "type": "object",
                    "properties": {"text": {"type": "string"}},
                    "required": ["text"],
                    "additionalProperties": False,
                },
                annotations={"readOnlyHint": True},
            ),
        )

    async def call_tool(self, _name: str, _input: Any) -> dict[str, Any]:
        return {"content": [{"type": "text", "text": "ok"}]}

    async def close(self) -> None:
        self.closed = True


class CapabilityMcpClient(FakeMcpClient):
    def supports(self, capability: str) -> bool:
        return capability in {"resources", "prompts"}


def test_remote_mcp_is_available_without_workspace(monkeypatch: Any) -> None:
    FakeMcpClient.instances.clear()
    monkeypatch.setattr("app.service.chat_service.McpClient", FakeMcpClient)
    harness = CapturingHarness()
    service = ChatService(
        ModelListProvider(),  # type: ignore[arg-type]
        PromptBuilder(),
        agent_harness=harness,  # type: ignore[arg-type]
    )
    request = ChatCompletionRequest.model_validate(
        {
            "messages": [{"role": "user", "content": "call Remote MCP echo"}],
            "connection": {
                "providerName": "OpenAI compatible",
                "baseUrl": "https://example.com/v1",
                "model": "example-model",
                "apiKey": "secret",
            },
            "promptContext": {
                "mcpServers": [
                    {
                        "serverId": "remote",
                        "name": "Remote",
                        "enabled": True,
                        "url": "https://mcp.example/mcp",
                    }
                ]
            },
        }
    )

    asyncio.run(_drain(service.stream(request, "correlation")))

    assert harness.registry.names() == ("mcp__remote__echo",)
    assert harness.tool_context is not None
    assert harness.tool_context.workspace_scoped is False
    assert [tool["function"]["name"] for tool in harness.prompt.tools] == [
        "mcp__remote__echo"
    ]
    assert len(FakeMcpClient.instances) == 1
    assert FakeMcpClient.instances[0].closed is True


def test_mcp_server_is_not_connected_for_ordinary_request(
    monkeypatch: Any,
) -> None:
    CapabilityMcpClient.instances.clear()
    monkeypatch.setattr(
        "app.service.chat_service.McpClient", CapabilityMcpClient
    )
    harness = CapturingHarness()
    service = ChatService(
        ModelListProvider(),  # type: ignore[arg-type]
        PromptBuilder(),
        agent_harness=harness,  # type: ignore[arg-type]
    )

    asyncio.run(_drain(service.stream(_mcp_request("解释一下 Python 装饰器"))))

    assert all(
        not name.startswith(("mcp__", "mcpmeta__"))
        for name in harness.registry.names()
    )
    assert harness.prompt.tools == ()
    assert CapabilityMcpClient.instances == []


def test_mcp_capability_catalogs_are_exposed_for_explicit_feature_request(
    monkeypatch: Any,
) -> None:
    monkeypatch.setattr(
        "app.service.chat_service.McpClient", CapabilityMcpClient
    )
    harness = CapturingHarness()
    service = ChatService(
        ModelListProvider(),  # type: ignore[arg-type]
        PromptBuilder(),
        agent_harness=harness,  # type: ignore[arg-type]
    )

    asyncio.run(_drain(service.stream(_mcp_request("列出 MCP 的 Resources 和 Prompts"))))

    assert harness.registry.names() == (
        "mcp__remote__echo",
        "mcpmeta__remote__resource_catalog",
        "mcpmeta__remote__resource_read",
        "mcpmeta__remote__prompt_catalog",
        "mcpmeta__remote__prompt_get",
    )


def test_mcp_server_name_activates_related_request(monkeypatch: Any) -> None:
    monkeypatch.setattr(
        "app.service.chat_service.McpClient", CapabilityMcpClient
    )
    harness = CapturingHarness()
    service = ChatService(
        ModelListProvider(),  # type: ignore[arg-type]
        PromptBuilder(),
        agent_harness=harness,  # type: ignore[arg-type]
    )

    request = _mcp_request("查看 GitHub 上的 issue")
    request.prompt_context.mcp_servers[0].name = "GitHub"
    asyncio.run(_drain(service.stream(request)))

    assert harness.registry.names() == ("mcp__remote__echo",)


def test_conceptual_mcp_question_does_not_connect_generic_server(
    monkeypatch: Any,
) -> None:
    CapabilityMcpClient.instances.clear()
    monkeypatch.setattr(
        "app.service.chat_service.McpClient", CapabilityMcpClient
    )
    harness = CapturingHarness()
    service = ChatService(
        ModelListProvider(),  # type: ignore[arg-type]
        PromptBuilder(),
        agent_harness=harness,  # type: ignore[arg-type]
    )

    asyncio.run(_drain(service.stream(_mcp_request("MCP 是什么？"))))

    assert CapabilityMcpClient.instances == []


def test_explicit_chinese_mcp_invocation_connects_server(
    monkeypatch: Any,
) -> None:
    CapabilityMcpClient.instances.clear()
    monkeypatch.setattr(
        "app.service.chat_service.McpClient", CapabilityMcpClient
    )
    harness = CapturingHarness()
    service = ChatService(
        ModelListProvider(),  # type: ignore[arg-type]
        PromptBuilder(),
        agent_harness=harness,  # type: ignore[arg-type]
    )

    asyncio.run(_drain(service.stream(_mcp_request("调用MCP工具 echo"))))

    assert len(CapabilityMcpClient.instances) == 1


def _mcp_request(content: str) -> ChatCompletionRequest:
    return ChatCompletionRequest.model_validate(
        {
            "messages": [{"role": "user", "content": content}],
            "connection": {
                "providerName": "OpenAI compatible",
                "baseUrl": "https://example.com/v1",
                "model": "example-model",
                "apiKey": "secret",
            },
            "promptContext": {
                "mcpServers": [
                    {
                        "serverId": "remote",
                        "name": "Remote",
                        "enabled": True,
                        "url": "https://mcp.example/mcp",
                    }
                ]
            },
        }
    )


async def _drain(events: AsyncIterator[RunEvent]) -> None:
    async for _event in events:
        pass
