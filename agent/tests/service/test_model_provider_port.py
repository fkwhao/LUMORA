from typing import get_type_hints

from app.harness.agent_harness import AgentHarness
from app.harness.ports.model_provider import (
    CompletionProviderPort,
    ModelProviderPort,
)
from app.provider.openai_compatible_provider import OpenAICompatibleProvider
from app.service.chat_service import ChatService
from app.service.memory_extraction_service import MemoryExtractionService


def test_openai_compatible_provider_implements_model_provider_port() -> None:
    assert isinstance(OpenAICompatibleProvider(), ModelProviderPort)


def test_runtime_layers_depend_on_provider_ports() -> None:
    assert get_type_hints(ChatService.__init__)["provider"] is ModelProviderPort
    assert (
        get_type_hints(MemoryExtractionService.__init__)["provider"]
        is CompletionProviderPort
    )
    assert (
        get_type_hints(AgentHarness.__init__)["provider"]
        is ModelProviderPort
    )
