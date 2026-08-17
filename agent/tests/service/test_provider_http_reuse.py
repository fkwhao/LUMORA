import asyncio
from typing import Any, ClassVar

import pytest

from app.model.model_connection_settings import ModelConnectionSettings
from app.provider.anthropic_provider import AnthropicProvider
from app.provider.openai_compatible_provider import OpenAICompatibleProvider
from app.provider.responses_provider import ResponsesProvider
from app.provider.routing_provider import RoutingModelProvider


class _ModelListResponse:
    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, Any]:
        return {"data": [{"id": "example-model"}]}


class _ReusableClient:
    instances: ClassVar[list["_ReusableClient"]] = []

    def __init__(self, **kwargs: Any) -> None:
        self.init_kwargs = kwargs
        self.timeouts: list[float] = []
        self.close_count = 0
        self.instances.append(self)

    async def get(self, *_args: Any, **kwargs: Any) -> _ModelListResponse:
        self.timeouts.append(float(kwargs["timeout"]))
        return _ModelListResponse()

    async def aclose(self) -> None:
        self.close_count += 1


@pytest.mark.parametrize(
    ("client_path", "provider_type", "api_format"),
    (
        (
            "app.provider.openai_compatible_provider.httpx.AsyncClient",
            OpenAICompatibleProvider,
            "chat-completions",
        ),
        (
            "app.provider.responses_provider.httpx.AsyncClient",
            ResponsesProvider,
            "responses",
        ),
        (
            "app.provider.anthropic_provider.httpx.AsyncClient",
            AnthropicProvider,
            "anthropic",
        ),
    ),
)
def test_provider_reuses_one_client_and_closes_it_on_shutdown(
    monkeypatch: pytest.MonkeyPatch,
    client_path: str,
    provider_type: type[
        OpenAICompatibleProvider | ResponsesProvider | AnthropicProvider
    ],
    api_format: str,
) -> None:
    _ReusableClient.instances = []
    monkeypatch.setattr(client_path, _ReusableClient)
    provider = provider_type()
    settings = ModelConnectionSettings(
        provider_name="Example",
        base_url="https://example.com/v1",
        model="example-model",
        api_key="secret",
        api_format=api_format,
    )

    async def exercise() -> None:
        assert await provider.list_models(settings) == ["example-model"]
        assert await provider.list_models(settings) == ["example-model"]
        assert len(_ReusableClient.instances) == 1
        client = _ReusableClient.instances[0]
        assert client.timeouts == [30.0, 30.0]
        assert client.init_kwargs["limits"].keepalive_expiry == 120.0
        await provider.close()
        await provider.close()
        assert client.close_count == 1

    asyncio.run(exercise())


def test_routing_provider_closes_each_unique_adapter_once() -> None:
    class _ClosableAdapter:
        def __init__(self) -> None:
            self.close_count = 0

        async def close(self) -> None:
            self.close_count += 1

    first = _ClosableAdapter()
    second = _ClosableAdapter()
    provider = RoutingModelProvider(adapters={  # type: ignore[arg-type]
        "chat-completions": first,
        "responses": first,
        "anthropic": second,
    })

    asyncio.run(provider.close())

    assert first.close_count == 1
    assert second.close_count == 1


@pytest.mark.parametrize(
    "provider_type",
    (OpenAICompatibleProvider, ResponsesProvider, AnthropicProvider),
)
def test_provider_does_not_close_or_discard_injected_client(
    provider_type: type[
        OpenAICompatibleProvider | ResponsesProvider | AnthropicProvider
    ],
) -> None:
    client = _ReusableClient()
    provider = provider_type(http_client=client)  # type: ignore[arg-type]

    asyncio.run(provider.close())

    assert client.close_count == 0
    assert provider._client() is client
