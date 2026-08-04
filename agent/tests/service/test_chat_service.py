import asyncio

from app.dto.request.model_list_request import ModelListRequest
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
